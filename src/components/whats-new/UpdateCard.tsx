// One "here's what we baked" card — the shared renderer for a WHATS_NEW entry.
//
// Lives here rather than inside /whats-new/page.tsx because TWO pages render
// the dev log now: the ✨ What's New page, and the ✨ What We Baked tab on the
// kid's 🧁 What's Baking page. Sharing the DATA alone would have let the two
// presentations drift apart, which is exactly the sort of thing nobody notices
// until a kid says "it looks different over here".
//
// Plain server component — no state, no effects. It renders inside a client tab
// shell on /tickets via the children-as-slot pattern, so it still gets rendered
// on the server there and never reaches the browser bundle.

import Link from 'next/link';
import type { WhatsNewEntry } from '@/lib/whats-new';

export default function UpdateCard({ entry }: { entry: WhatsNewEntry }) {
  return (
    <article className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* Top row — area + date + "you asked for it" badge */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-100 to-emerald-100 text-2xl dark:from-rose-950 dark:to-emerald-950"
            aria-hidden
          >
            {entry.emoji}
          </span>
          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              {entry.area} · {entry.dateLabel}
            </span>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              {entry.headline}
            </h2>
          </div>
        </div>

        {entry.fromKids ? (
          <span className="flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <span aria-hidden>🧁</span>
            You baked this!
          </span>
        ) : null}
      </div>

      {/* Blurb */}
      <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">{entry.blurb}</p>

      {/* Changes list */}
      <ul className="mt-4 flex flex-col gap-2">
        {entry.changes.map((c, i) => (
          <li key={i} className="flex items-start gap-3 rounded-2xl bg-zinc-50 px-4 py-3 dark:bg-zinc-800/60">
            <span className="text-lg leading-6" aria-hidden>{c.emoji}</span>
            <span className="text-sm text-zinc-700 dark:text-zinc-300">{c.text}</span>
          </li>
        ))}
      </ul>

      {/* Try-it button */}
      {entry.playHref ? (
        <div className="mt-5">
          {/* An `act` control that happens to navigate — same shell as every
              other "go play this" button, rendered as a link so it keeps
              middle-click and open-in-new-tab. */}
          <Link
            href={entry.playHref}
            className="candy-shell font-display inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold transition-[transform,box-shadow,filter] duration-100 ease-out hover:brightness-105 active:scale-95"
            style={{
              minHeight: 'var(--min-tap-target)',
              '--c-from': 'var(--act-from)',
              '--c-to': 'var(--act-to)',
              '--c-ink': 'var(--act-ink)',
              '--c-glow': 'var(--act-glow)',
            } as React.CSSProperties}
          >
            <span aria-hidden>🎮</span>
            {entry.playLabel ?? 'Try it'}
            <span aria-hidden>→</span>
          </Link>
        </div>
      ) : null}
    </article>
  );
}
