// The Usage block on /admin: how much kids are playing, from their answers.
// Server-rendered SVG, no chart library: two small single-series bar charts
// (never one chart with two scales) and a table by family. Each bar carries a
// <title>, so hovering or long-pressing it reads the exact day and value.

import type { Usage, UsageDay } from '@/lib/admin/usage';

const W = 600;
const H = 110;
const GAP = 2;
const R = 4;

function shortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d}`;
}

/** A bar with its top corners rounded and its base square on the axis. */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(R, w / 2, h);
  return `M${x},${H}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${H}Z`;
}

function DayChart({
  title,
  unit,
  days,
  pick,
  barClass,
}: {
  title: string;
  unit: string;
  days: UsageDay[];
  pick: (d: UsageDay) => number;
  barClass: string;
}) {
  const max = Math.max(1, ...days.map(pick));
  const step = W / days.length;
  const bw = Math.max(1, step - GAP);
  const total = days.reduce((s, d) => s + pick(d), 0);
  return (
    <figure className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">Busiest day {max.toLocaleString('en-US')}</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H + 18}`}
        className="mt-3 block h-auto w-full"
        role="img"
        aria-label={`${title}: ${total.toLocaleString('en-US')} over ${days.length} days, busiest day ${max}.`}
      >
        <line x1={0} x2={W} y1={H} y2={H} className="stroke-zinc-200 dark:stroke-zinc-700" strokeWidth={1} />
        {days.map((d, i) => {
          const v = pick(d);
          const h = v === 0 ? 0 : Math.max(2, (v / max) * (H - 4));
          return (
            <g key={d.date}>
              {/* Full-height hit area, so a thin or empty day still shows its value. */}
              <rect x={i * step} y={0} width={step} height={H} fill="transparent">
                <title>{`${shortDate(d.date)}: ${v} ${unit}`}</title>
              </rect>
              {h > 0 ? (
                <path d={barPath(i * step + GAP / 2, H - h, bw, h)} className={barClass} pointerEvents="none" />
              ) : null}
            </g>
          );
        })}
        {[0, Math.floor(days.length / 2), days.length - 1].map((i) => (
          <text
            key={i}
            x={i * step + step / 2}
            y={H + 14}
            textAnchor={i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'}
            className="fill-zinc-500 text-[11px] dark:fill-zinc-400"
          >
            {shortDate(days[i].date)}
          </text>
        ))}
      </svg>
    </figure>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {note ? <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{note}</p> : null}
    </div>
  );
}

const pct = (v: number | null) => (v == null ? 'none' : `${Math.round(v * 100)}%`);
const n = (v: number) => v.toLocaleString('en-US');

export default function UsageSection({ usage }: { usage: Usage }) {
  const { totals, days, families } = usage;
  return (
    <section id="usage" aria-labelledby="usage-title" className="mt-10 scroll-mt-32 lg:scroll-mt-6">
      <h2 id="usage-title" className="text-xl font-semibold">
        Usage
      </h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        From every answer kids give in games, last 30 days, New York time. Minutes count each answer up to 2
        minutes, so they are a floor, not time on the iPad. AI spend is not recorded anywhere yet.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Answers, 30 days" value={n(totals.answers30d)} note={`${n(totals.answers7d)} in 7 days`} />
        <Stat
          label="Kids playing, 30 days"
          value={n(totals.activeKids30d)}
          note={`${n(totals.activeKids7d)} in 7 days, ${n(totals.activeFamilies30d)} families`}
        />
        <Stat label="Minutes answering, 30 days" value={n(totals.minutes30d)} />
        <Stat label="Answers right, 30 days" value={pct(totals.accuracy30d)} />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <DayChart
          title="Answers per day"
          unit="answers"
          days={days}
          pick={(d) => d.answers}
          barClass="fill-rose-500 dark:fill-rose-400"
        />
        <DayChart
          title="Kids playing per day"
          unit="kids"
          days={days}
          pick={(d) => d.kids}
          barClass="fill-sky-600 dark:fill-sky-400"
        />
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <caption className="sr-only">Usage by family, last 30 days</caption>
          <thead className="text-xs text-zinc-500 dark:text-zinc-400">
            <tr>
              <th scope="col" className="py-2 pr-4 font-medium">Family</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">Days played</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">Kids playing</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">Answers</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">Right</th>
              <th scope="col" className="py-2 text-right font-medium">Minutes</th>
            </tr>
          </thead>
          <tbody>
            {families.map((f) => (
              <tr key={f.id} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="py-2 pr-4 font-medium">{f.name}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{f.activeDays}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{f.activeKids}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{n(f.answers)}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{pct(f.accuracy)}</td>
                <td className="py-2 text-right tabular-nums">{n(f.minutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
