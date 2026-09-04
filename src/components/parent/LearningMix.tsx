// Learning Mix — a one-glance answer to "what TYPES of things is my kid doing?"
//
// A single stacked bar of rounds by subject (Math / Reading / Logic) with a
// counted legend beneath. The bar carries proportion; the legend carries
// identity + the raw numbers, so the chart is never color-alone (a colorblind
// parent, or one on a grayscale phone, still reads it). Segments are separated
// by a 2px surface gap per the dataviz mark spec.
//
// Server component, static: a parent dashboard doesn't need a JS hover layer,
// and native `title` tooltips cover the "what's this sliver" case. Only rounds
// with a recorded game are counted (see subjectMix); the untracked remainder is
// surfaced elsewhere on the page.

import { SUBJECT_META, type SubjectCount } from '@/lib/parent/subjects';

export default function LearningMix({ mix }: { mix: SubjectCount[] }): React.ReactElement | null {
  const total = mix.reduce((n, m) => n + m.rounds, 0);
  if (total === 0) return null;

  const pct = (n: number) => Math.round((n / total) * 100);
  const summary = mix.map((m) => `${SUBJECT_META[m.subject].label} ${pct(m.rounds)}%`).join(', ');

  return (
    <div>
      <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
        Learning mix
      </div>
      <div
        className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full"
        role="img"
        aria-label={`Learning mix by rounds: ${summary}`}
      >
        {mix.map((m) => (
          <div
            key={m.subject}
            title={`${SUBJECT_META[m.subject].label}: ${m.rounds} round${m.rounds === 1 ? '' : 's'} (${pct(m.rounds)}%)`}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${(m.rounds / total) * 100}%`, backgroundColor: SUBJECT_META[m.subject].color }}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {mix.map((m) => (
          <li key={m.subject} className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: SUBJECT_META[m.subject].color }}
            />
            <span className="font-medium">
              {SUBJECT_META[m.subject].glyph} {SUBJECT_META[m.subject].label}
            </span>
            <span className="tabular-nums text-zinc-400">
              {m.rounds} · {pct(m.rounds)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
