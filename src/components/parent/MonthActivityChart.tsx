// All-time activity — rounds per MONTH, the counterpart to ActivityChart's
// per-day view.
//
// Why a different bucket rather than the same chart stretched: a year of daily
// bars is 365 hairlines that read as noise. Changing the bucket keeps the same
// question ("how often are they playing?") legible at any span.
//
// Each bar is a LINK to that month, which is what makes this the navigation for
// long histories — no dropdown needed, and the shape of the history tells you
// which month is worth opening. Empty months keep a faint tick so a gap reads as
// "stopped playing" rather than closing up into continuous play.
//
// Server component, static, no client JS.

import Link from 'next/link';
import type { MonthCount } from '@/lib/parent/subjects';
import { periodToParam } from '@/lib/parent/periods';

export default function MonthActivityChart({
  months,
  basePath,
}: {
  months: MonthCount[];
  /** Route each bar links to. Shared component — see PeriodNav. */
  basePath: string;
}): React.ReactElement | null {
  if (months.length === 0) return null;
  const max = Math.max(1, ...months.map((m) => m.rounds));
  const activeMonths = months.filter((m) => m.rounds > 0).length;
  // Year ticks only where the year actually changes, so a multi-year history
  // doesn't repeat "2026" under every bar.
  const yearAt = (i: number): string | null =>
    i === 0 || months[i].year !== months[i - 1].year ? String(months[i].year) : null;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Activity by month
        </span>
        <span className="text-xs text-zinc-400">
          {activeMonths} month{activeMonths === 1 ? '' : 's'} played
        </span>
      </div>
      <div className="flex h-20 items-end gap-1">
        {months.map((m) => (
          <Link
            key={`${m.year}-${m.month}`}
            href={`${basePath}?period=${periodToParam({ kind: 'month', year: m.year, month: m.month })}`}
            title={`${m.label} ${m.year}: ${m.rounds} round${m.rounds === 1 ? '' : 's'} — open this month`}
            className="flex h-full flex-1 items-end rounded-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            {m.rounds > 0 ? (
              <div
                className="w-full rounded-t-[3px] bg-rose-500"
                style={{ height: `${Math.max(6, (m.rounds / max) * 100)}%` }}
              />
            ) : (
              <div className="h-px w-full bg-zinc-200 dark:bg-zinc-700" />
            )}
          </Link>
        ))}
      </div>
      <div className="mt-1 flex gap-1 text-[10px] tabular-nums text-zinc-400">
        {months.map((m, i) => (
          <span key={`${m.year}-${m.month}`} className="flex-1 truncate text-center">
            {months.length <= 18 ? m.label : yearAt(i) ? m.label : ''}
          </span>
        ))}
      </div>
      {months.length > 18 && (
        <div className="mt-0.5 flex gap-1 text-[10px] tabular-nums text-zinc-400">
          {months.map((m, i) => (
            <span key={`y-${m.year}-${m.month}`} className="flex-1 truncate text-center">
              {yearAt(i) ?? ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
