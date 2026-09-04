'use client';

// The 🧁 What's Baking tab shell — and NOTHING else.
//
// This component owns exactly one thing: which tab is showing. Both panels are
// passed in as ReactNode SLOTS, so they stay Server Components rendered on the
// server (Next's children-as-slot pattern). That matters here: the dev log is
// ~14 entries of static copy, and routing it through a client component would
// have shipped every word of it into the browser bundle for no reason.
//
// Why tabs and not two stacked sections: a kid has a handful of their own ideas
// and there are now a dozen-plus updates. Stacked, their own tickets — the part
// they came to see — get buried above a wall of changelog.
//
// Both panels stay MOUNTED and are hidden with `hidden`, rather than swapped
// with a conditional. Toggling the attribute keeps the inactive panel's scroll
// position and lets in-page anchors resolve, and there is no cost to it because
// the markup is server-rendered either way.

import { useId, useState } from 'react';

export type OvenTab = 'ideas' | 'baked';

export default function StoryOvenTabs({
  ideasCount,
  bakedCount,
  ideas,
  baked,
}: {
  ideasCount: number;
  bakedCount: number;
  ideas: React.ReactNode;
  baked: React.ReactNode;
}) {
  const [tab, setTab] = useState<OvenTab>('ideas');
  const base = useId();

  const TABS: Array<{ key: OvenTab; emoji: string; label: string; count: number }> = [
    { key: 'ideas', emoji: '🧁', label: 'My Ideas', count: ideasCount },
    { key: 'baked', emoji: '✨', label: 'What We Baked', count: bakedCount },
  ];

  return (
    <>
      {/* ---- Tab strip ---- */}
      <div className="px-6 sm:px-8">
        <div
          role="tablist"
          aria-label="Story Oven sections"
          className="mx-auto flex max-w-3xl gap-2 rounded-full bg-zinc-100 p-1.5 dark:bg-zinc-800/70"
        >
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                id={`${base}-tab-${t.key}`}
                role="tab"
                type="button"
                aria-selected={active}
                aria-controls={`${base}-panel-${t.key}`}
                onClick={() => setTab(t.key)}
                style={{ minHeight: 'var(--min-tap-target)' }}
                className={`flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition-all active:scale-95 ${
                  active
                    ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
              >
                <span className="text-base" aria-hidden>{t.emoji}</span>
                <span>{t.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                    active
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'bg-white/70 text-zinc-500 dark:bg-black/30 dark:text-zinc-400'
                  }`}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ---- Panels ---- */}
      <div
        id={`${base}-panel-ideas`}
        role="tabpanel"
        aria-labelledby={`${base}-tab-ideas`}
        hidden={tab !== 'ideas'}
      >
        {ideas}
      </div>
      <div
        id={`${base}-panel-baked`}
        role="tabpanel"
        aria-labelledby={`${base}-tab-baked`}
        hidden={tab !== 'baked'}
      >
        {baked}
      </div>
    </>
  );
}
