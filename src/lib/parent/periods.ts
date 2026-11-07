// Time-frame selection for the parent portal.
//
// /parent/gameplay showed only the current calendar month, which meant a parent
// could not see whether a kid was doing more or less than last month — the one
// comparison that makes any of these numbers mean anything. This module is the
// period vocabulary: parse it from the URL, bound it to months that actually
// have data, label it, and turn it into a query range.
//
// Pure — no DB, no React — so the page, the digest email builder and a unit test
// can all share one definition of "August 2026".
//
// ── THE TRACKING BOUNDARY ───────────────────────────────────────────────────
// Opening up history crosses 2026-07-26, the day migration 0038 added
// `game_slug` (and promoted `completed` out of raw_response). There was NO
// backfill, so every earlier row has a NULL game and a NULL completed flag.
// Those rows are real plays and must be counted as activity — but they can never
// be attributed to a game or scored for completion. A month before the boundary
// will therefore show rounds and no game breakdown, and that is the honest
// answer, not a bug. `isFullyTracked` below is what lets the UI say so instead
// of rendering "0% finished" for a month that simply predates the column.

/** The day `attempts.game_slug` started being written (migration 0038).
 *  Local midnight, matching how every other date in the portal is bucketed —
 *  the parent reads their own day boundaries, not UTC. */
export const TRACKING_START = new Date(2026, 6, 26); // 2026-07-26

export type Period =
  | { kind: 'month'; year: number; month: number } // month is 0-indexed, like Date
  | { kind: 'all' };

export interface MonthRef {
  year: number;
  month: number;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** URL form: `2026-08` or `all`. */
export function periodToParam(p: Period): string {
  return p.kind === 'all' ? 'all' : `${p.year}-${pad2(p.month + 1)}`;
}

/** Parse `?period=`. Anything unrecognised falls back to the current month
 *  rather than erroring — a hand-edited URL should land somewhere sensible.
 *
 *  Deliberately does NOT clamp to the data range: an empty month is a valid
 *  thing to look at ("did they play in May? no"), and clamping would silently
 *  redirect a parent somewhere they didn't ask for. The stepper bounds are a
 *  separate concern (see `stepMonth`). */
export function parsePeriod(raw: string | undefined, now: Date): Period {
  if (raw === 'all') return { kind: 'all' };
  const m = /^(\d{4})-(\d{2})$/.exec(raw ?? '');
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]) - 1;
    if (year >= 2000 && year <= 2200 && month >= 0 && month <= 11) {
      return { kind: 'month', year, month };
    }
  }
  return { kind: 'month', year: now.getFullYear(), month: now.getMonth() };
}

/** Inclusive-start / exclusive-end range for a period, as local Dates.
 *  `from`/`to` are null for 'all' — the caller should not bound the query. */
export function periodRange(p: Period): { from: Date | null; to: Date | null } {
  if (p.kind === 'all') return { from: null, to: null };
  return {
    from: new Date(p.year, p.month, 1),
    to: new Date(p.year, p.month + 1, 1),
  };
}

export function periodLabel(p: Period, now: Date): string {
  if (p.kind === 'all') return 'All time';
  const d = new Date(p.year, p.month, 1);
  const label = d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  return isSameMonth(p, now) ? `${label}` : label;
}

/** Short form for the stepper arrows' titles. */
export function monthLabelShort(ref: MonthRef): string {
  return new Date(ref.year, ref.month, 1).toLocaleString(undefined, {
    month: 'short',
    year: 'numeric',
  });
}

export function isSameMonth(p: Period, d: Date): boolean {
  return p.kind === 'month' && p.year === d.getFullYear() && p.month === d.getMonth();
}

/** Every month from `earliest` through `now`, newest first. Used for the
 *  dropdown and to bound the stepper.
 *
 *  `earliest` null (a family with no attempts at all) yields just the current
 *  month, so the control still renders rather than collapsing to nothing. */
export function monthsBetween(earliest: Date | null, now: Date): MonthRef[] {
  const out: MonthRef[] = [];
  const startY = earliest ? earliest.getFullYear() : now.getFullYear();
  const startM = earliest ? earliest.getMonth() : now.getMonth();
  let y = now.getFullYear();
  let m = now.getMonth();
  // Guard against a bad `earliest` (clock skew, a future-dated row) producing an
  // unbounded loop: 600 months is 50 years, far past anything real.
  for (let i = 0; i < 600; i += 1) {
    out.push({ year: y, month: m });
    if (y === startY && m === startM) break;
    if (y < startY || (y === startY && m < startM)) break;
    m -= 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
  }
  return out;
}

/** The month `delta` steps from `p`, or null if that would leave the range of
 *  months that have data (older) or go past the current month (newer).
 *
 *  Returning null rather than clamping is what lets the UI DISABLE the arrow
 *  instead of rendering one that silently does nothing. */
export function stepMonth(p: Period, delta: number, months: MonthRef[]): Period | null {
  if (p.kind !== 'month' || months.length === 0) return null;
  // months is newest-first, so a POSITIVE delta (forward in time) walks toward
  // index 0. Getting this backwards is the obvious bug here.
  const idx = months.findIndex((x) => x.year === p.year && x.month === p.month);
  if (idx < 0) return null;
  const next = idx - delta;
  if (next < 0 || next >= months.length) return null;
  return { kind: 'month', year: months[next].year, month: months[next].month };
}

/** Does this period lie entirely after game tracking began? If not, the UI must
 *  say why part or all of it has no game breakdown. */
export function isFullyTracked(p: Period): boolean {
  if (p.kind === 'all') return false;
  return new Date(p.year, p.month, 1) >= new Date(
    TRACKING_START.getFullYear(),
    TRACKING_START.getMonth(),
    1,
  ) && !(p.year === TRACKING_START.getFullYear() && p.month === TRACKING_START.getMonth());
}

/** Does this period end before tracking began — i.e. NOTHING in it can carry a
 *  game? Lets the UI skip the game section entirely and explain, rather than
 *  showing an empty list that reads as "played nothing". */
export function isEntirelyUntracked(p: Period): boolean {
  if (p.kind === 'all') return false;
  const end = new Date(p.year, p.month + 1, 1);
  return end <= TRACKING_START;
}
