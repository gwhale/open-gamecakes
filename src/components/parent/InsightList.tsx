// Renders the "so what" for one kid: ranked insights, each with its next step.
//
// Concerns are styled to stand out and come first (buildInsights already orders
// them). A win is always shown last when there is one, so the picture is never
// only problems — but it never leads, because the actionable thing should.

import Link from 'next/link';
import type { Insight } from '@/lib/parent/insights';

const TONE: Record<Insight['tone'], { bar: string; chip: string; word: string }> = {
  concern: {
    bar: 'border-rose-400',
    chip: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
    word: 'Worth a look',
  },
  note: {
    bar: 'border-amber-400',
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
    word: 'Context',
  },
  win: {
    bar: 'border-emerald-400',
    chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
    word: 'Going well',
  },
};

export default function InsightList({ insights }: { insights: Insight[] }): React.ReactElement {
  return (
    <ul className="flex flex-col gap-2.5">
      {insights.map((i, n) => {
        const t = TONE[i.tone];
        return (
          <li
            key={`${i.title}-${n}`}
            className={`rounded-r-xl border-l-4 bg-white px-4 py-3 dark:bg-zinc-900 ${t.bar}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${t.chip}`}>
                {t.word}
              </span>
              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{i.title}</span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {i.detail}
            </p>
            {i.action && (
              <Link
                href={i.action.href}
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-3.5 py-1.5 text-xs font-bold text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                {i.action.label} →
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
