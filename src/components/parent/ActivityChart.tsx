// Activity — the engagement cadence: how many rounds each day this month.
//
// Answers "is my kid playing a little every day, or bingeing once a week?" — a
// magnitude-over-time read, so it's a single-hue bar per day (brand rose), not
// a categorical palette. Empty days keep a faint 1px tick so the axis stays
// continuous and a gap reads as "nothing that day", not a missing bar. Weekend
// days get a faintly tinted track so the weekly rhythm is legible.
//
// Server component, static. `title` gives a native per-day tooltip; the header
// carries the headline number (active days) so identity isn't bar-height-alone.

import type { DayCount } from '@/lib/parent/subjects';

export default function ActivityChart({
  days,
  monthLabel,
}: {
  days: DayCount[];
  monthLabel: string;
}): React.ReactElement | null {
  if (days.length === 0) return null;
  const max = Math.max(1, ...days.map((d) => d.rounds));
  const activeDays = days.filter((d) => d.rounds > 0).length;
  const mid = Math.floor(days.length / 2);

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Activity</span>
        <span className="text-xs text-zinc-400">
          {activeDays} active day{activeDays === 1 ? '' : 's'}
        </span>
      </div>
      <div className="flex h-16 items-end gap-px">
        {days.map((d) => (
          <div
            key={d.day}
            title={`${monthLabel} ${d.day}: ${d.rounds} round${d.rounds === 1 ? '' : 's'}`}
            className={`flex h-full flex-1 items-end rounded-sm ${d.isWeekend ? 'bg-zinc-100 dark:bg-zinc-800/60' : ''}`}
          >
            {d.rounds > 0 ? (
              <div
                className="w-full rounded-t-[3px] bg-rose-500"
                style={{ height: `${Math.max(6, (d.rounds / max) * 100)}%` }}
              />
            ) : (
              <div className="h-px w-full bg-zinc-200 dark:bg-zinc-700" />
            )}
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-zinc-400">
        <span>{monthLabel.split(' ')[0]} {days[0]?.day}</span>
        <span>{days[mid]?.day}</span>
        <span>{days[days.length - 1]?.day}</span>
      </div>
    </div>
  );
}
