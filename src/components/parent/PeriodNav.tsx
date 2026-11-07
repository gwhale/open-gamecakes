// Time-frame control for /parent/gameplay.
//
// Plain links, no client JS: the page is a server component and the period lives
// in the URL, so back/forward work, a month is linkable, and there is no
// hydration cost. A <select> would need a client bundle to submit on change.
//
// A step that would leave the data range renders as a DISABLED span rather than
// a dead link — an arrow that looks live and does nothing is worse than one that
// visibly can't be pressed.

import Link from 'next/link';
import {
  monthLabelShort,
  periodLabel,
  periodToParam,
  stepMonth,
  type MonthRef,
  type Period,
} from '@/lib/parent/periods';

const btn =
  'inline-flex items-center justify-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors';
const live =
  'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800';
const dead =
  'cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-700';

function Step({
  target,
  glyph,
  label,
  basePath,
}: {
  /** Route the period param hangs off — this control is shared by more than
   *  one parent page, so the destination cannot be baked in. */
  basePath: string;
  /** Null when the step would leave the data range — rendered disabled. */
  target: Period | null;
  glyph: string;
  label: string;
}): React.ReactElement {
  if (!target || target.kind !== 'month') {
    return (
      <span className={`${btn} ${dead}`} aria-disabled="true" aria-label={`${label} (unavailable)`}>
        {glyph}
      </span>
    );
  }
  const name = monthLabelShort({ year: target.year, month: target.month });
  return (
    <Link
      href={`${basePath}?period=${periodToParam(target)}`}
      className={`${btn} ${live}`}
      aria-label={`${label}: ${name}`}
      title={name}
    >
      {glyph}
    </Link>
  );
}

export default function PeriodNav({
  period,
  months,
  now,
  basePath,
}: {
  period: Period;
  months: MonthRef[];
  now: Date;
  basePath: string;
}): React.ReactElement {
  const prev = stepMonth(period, -1, months);
  const next = stepMonth(period, 1, months);
  const isAll = period.kind === 'all';
  // Leaving all-time returns you to the newest month with data, not to "today" —
  // for a family that stopped playing in June, today's month is empty and would
  // read as a broken control.
  const newest = months[0] ?? { year: now.getFullYear(), month: now.getMonth() };

  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="Time frame">
      <Step target={prev} glyph="←" label="Previous month" basePath={basePath} />
      <span className="min-w-[9.5rem] text-center text-sm font-semibold tabular-nums">
        {periodLabel(period, now)}
      </span>
      <Step target={next} glyph="→" label="Next month" basePath={basePath} />

      <span className="mx-1 hidden h-5 w-px bg-zinc-200 dark:bg-zinc-800 sm:block" />

      <Link
        href={`${basePath}?period=${isAll ? periodToParam({ kind: 'month', ...newest }) : 'all'}`}
        aria-current={isAll ? 'page' : undefined}
        className={`${btn} ${
          isAll
            ? 'border-rose-500 bg-rose-500 text-white hover:bg-rose-600'
            : live
        }`}
      >
        {isAll ? `Back to ${monthLabelShort(newest)}` : 'All time'}
      </Link>
    </nav>
  );
}
