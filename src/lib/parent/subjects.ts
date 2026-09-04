// Subject metadata + activity rollups for the parent portal.
//
// "What TYPES of things is my kid doing?" — math, reading, or logic — is a
// question the per-game list can't answer at a glance. This module maps a play
// (an `attempts` row) to its subject via the GAME registry (game_slug → subject)
// and rolls plays up two ways a parent cares about:
//   • subjectMix   — the balance of math / reading / logic this period
//   • activityByDay — the engagement cadence (which days they actually played)
//
// The colors are the ONLY chart palette in the portal and are shared verbatim
// with the weekly email so a subject reads the same in both. They are the
// dataviz-validated categorical triple (colorblind-safe, ΔE ≥ 23 between every
// adjacent pair, and inside the lightness band on BOTH the light and dark chart
// surfaces — `dataviz/scripts/validate_palette.js`), so do not hand-tweak them
// without re-running that validator.
//
// Pure data — no DB, no React — so both the server page and the email builder
// (and a unit test) can share it.

import type { GameSubject } from '@/lib/games/registry';

/** Fixed render order — a categorical palette is assigned in a stable order and
 *  never cycled, so Math is always rose, Reading always blue, Logic always
 *  amber, no matter which subjects a given kid actually touched. */
export const SUBJECT_ORDER: readonly GameSubject[] = ['math', 'reading', 'logic'];

export interface SubjectMeta {
  label: string;
  glyph: string;
  /** Validated categorical hue — same value on light and dark surfaces. */
  color: string;
}

export const SUBJECT_META: Record<GameSubject, SubjectMeta> = {
  math: { label: 'Math', glyph: '🔢', color: '#f43f5e' },
  reading: { label: 'Reading', glyph: '📖', color: '#3b82f6' },
  logic: { label: 'Logic', glyph: '🧠', color: '#d97706' },
};

export interface SubjectCount {
  subject: GameSubject;
  rounds: number;
}

/** Rounds grouped by subject, in fixed order, zero-subjects dropped.
 *
 *  Only rows carrying a game_slug can be attributed (subject comes from the
 *  game). Untracked rows — plays from before game tracking began 2026-07-26 —
 *  are deliberately excluded rather than guessed at, matching how the gameplay
 *  page and digest already handle the tracking hole. Callers that need the
 *  untracked count keep it separately. */
export function subjectMix(
  rows: readonly { game_slug: string | null }[],
  gameSubject: (slug: string) => GameSubject | null,
): SubjectCount[] {
  const tally = new Map<GameSubject, number>();
  for (const r of rows) {
    if (!r.game_slug) continue;
    const s = gameSubject(r.game_slug);
    if (!s) continue;
    tally.set(s, (tally.get(s) ?? 0) + 1);
  }
  return SUBJECT_ORDER.map((subject) => ({ subject, rounds: tally.get(subject) ?? 0 })).filter(
    (x) => x.rounds > 0,
  );
}

export interface DayCount {
  /** Day-of-month (1-based). */
  day: number;
  rounds: number;
  isWeekend: boolean;
}

/** Rounds per calendar day for the month containing `monthStart`, from day 1
 *  through `today` (a partial current month stops at today rather than padding
 *  the rest of the month with empty bars that read as "stopped playing").
 *
 *  Bucketed in the server's local zone — the parent reads it in their own day
 *  boundaries, not UTC. Includes untracked rows: activity is activity whether or
 *  not the game was recorded. */
export function activityByDay(
  rows: readonly { created_at: string }[],
  monthStart: Date,
  today: Date,
): DayCount[] {
  const y = monthStart.getFullYear();
  const m = monthStart.getMonth();
  const sameMonth = today.getFullYear() === y && today.getMonth() === m;
  const lastDay = sameMonth ? today.getDate() : new Date(y, m + 1, 0).getDate();

  const counts = new Array<number>(lastDay + 1).fill(0); // 1-indexed; [0] unused
  for (const r of rows) {
    const d = new Date(r.created_at);
    if (d.getFullYear() !== y || d.getMonth() !== m) continue;
    const day = d.getDate();
    if (day >= 1 && day <= lastDay) counts[day] += 1;
  }

  const out: DayCount[] = [];
  for (let day = 1; day <= lastDay; day += 1) {
    const dow = new Date(y, m, day).getDay();
    out.push({ day, rounds: counts[day], isWeekend: dow === 0 || dow === 6 });
  }
  return out;
}

export interface MonthCount {
  year: number;
  /** 0-indexed, like Date. */
  month: number;
  rounds: number;
  /** Short label for the axis, e.g. "Aug". */
  label: string;
}

/** Rounds per calendar MONTH, oldest first — the all-time counterpart to
 *  `activityByDay`.
 *
 *  A day-resolution chart over a year would be 365 hairline bars that read as
 *  noise, so the all-time view changes the BUCKET rather than squeezing the same
 *  one. Months with no play are still emitted, so a gap reads as "stopped
 *  playing" instead of silently closing up and making the history look
 *  continuous.
 *
 *  Bucketed in the server's local zone, matching activityByDay. Includes
 *  untracked rows: activity is activity whether or not the game was recorded. */
export function activityByMonth(
  rows: readonly { created_at: string }[],
  earliest: Date,
  today: Date,
): MonthCount[] {
  const key = (y: number, m: number): string => `${y}-${m}`;
  const tally = new Map<string, number>();
  for (const r of rows) {
    const d = new Date(r.created_at);
    tally.set(key(d.getFullYear(), d.getMonth()), (tally.get(key(d.getFullYear(), d.getMonth())) ?? 0) + 1);
  }

  const out: MonthCount[] = [];
  let y = earliest.getFullYear();
  let m = earliest.getMonth();
  for (let i = 0; i < 600; i += 1) {
    out.push({
      year: y,
      month: m,
      rounds: tally.get(key(y, m)) ?? 0,
      label: new Date(y, m, 1).toLocaleString(undefined, { month: 'short' }),
    });
    if (y === today.getFullYear() && m === today.getMonth()) break;
    if (y > today.getFullYear() || (y === today.getFullYear() && m > today.getMonth())) break;
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return out;
}
