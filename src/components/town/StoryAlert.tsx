'use client';

// StoryAlert — the storybook toast that announces a world event.
//
// A "special" cousin of ThreeTownHost's CakeyHint: same bottom-center overlay
// slot + role="status", but a warm cream CARD (not a utility pill) so it reads
// as a story, not a tip. It carries the story's WHAT (title) + WHY (blurb), a
// ribbon top-bar tinted to the land it's about, and two actions:
//   * "See what happened" — the primary CTA; opens the narrated StoryCard.
//   * "Later"             — dismisses.
// Both count as "seen" (the host marks it on either), so the toast shows once.
//
// Styling is CSS/emoji/gradient only (no asset pipeline). Entrance reuses the
// existing `animate-cakey-pop` keyframe, which already degrades to a static lift
// under prefers-reduced-motion.

import { findRegion } from '@/lib/town/regions';
import type { StoryEvent } from '@/lib/town/story-events';

/** Per-ribbon class sets — full static strings so Tailwind never purges them.
 *  Keyed by Region.ribbon; picks the top-bar gradient, soft ring, icon chip
 *  and kicker colour.
 *
 *  The CTA is deliberately NOT themed. It used to carry a seventh gradient per
 *  ribbon, all of them white-on-light — the amber one sat at 1.67:1. The button
 *  always does the same thing (open the story), so under the Layer Rule it takes
 *  one role. The story's identity still reads through the four keys below. */
const RIBBON_THEME: Record<
  'STRAWBERRY' | 'MINT' | 'AMBER' | 'BLUE' | 'PINK' | 'PURPLE',
  { bar: string; ring: string; chip: string; kicker: string }
> = {
  STRAWBERRY: {
    bar: 'from-rose-300 to-rose-500',
    ring: 'ring-rose-300/50',
    chip: 'bg-rose-500/15',
    kicker: 'text-rose-600 dark:text-rose-400',
  },
  MINT: {
    bar: 'from-emerald-300 to-emerald-500',
    ring: 'ring-emerald-300/50',
    chip: 'bg-emerald-500/15',
    kicker: 'text-emerald-700 dark:text-emerald-400',
  },
  AMBER: {
    bar: 'from-amber-300 to-amber-500',
    ring: 'ring-amber-300/50',
    chip: 'bg-amber-500/15',
    kicker: 'text-amber-700 dark:text-amber-400',
  },
  BLUE: {
    bar: 'from-sky-300 to-blue-500',
    ring: 'ring-sky-300/50',
    chip: 'bg-sky-500/15',
    kicker: 'text-sky-600',
  },
  PINK: {
    bar: 'from-pink-300 to-fuchsia-500',
    ring: 'ring-pink-300/50',
    chip: 'bg-pink-500/15',
    kicker: 'text-pink-600',
  },
  PURPLE: {
    bar: 'from-violet-300 to-purple-500',
    ring: 'ring-violet-300/50',
    chip: 'bg-violet-500/15',
    kicker: 'text-violet-600',
  },
};

interface StoryAlertProps {
  story: StoryEvent;
  /** Primary CTA — mark seen + open the narrated StoryCard. */
  onWatch: () => void;
  /** Dismiss — mark seen, no card. */
  onDismiss: () => void;
}

export default function StoryAlert({ story, onWatch, onDismiss }: StoryAlertProps): React.ReactElement {
  // Theme the card to the land the story is about (falls back to STRAWBERRY for
  // a non-spatial story). The landmark emoji rides beside the ✨ in the chip.
  const region = story.regionSlug ? findRegion(story.regionSlug) : undefined;
  const theme = RIBBON_THEME[region?.ribbon ?? 'STRAWBERRY'];

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed fixed-bottom-safe-hi left-1/2 z-30 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2"
    >
      <div
        className={
          'animate-cakey-pop pointer-events-auto overflow-hidden rounded-3xl bg-gradient-to-b from-amber-50 to-rose-50 shadow-lg shadow-rose-500/20 ring-1 ' +
          theme.ring +
          ' dark:from-zinc-800 dark:to-zinc-900'
        }
      >
        {/* Candy ribbon top-bar in the land's color. */}
        <div className={'h-1.5 w-full bg-gradient-to-r ' + theme.bar} />

        <div className="border-2 border-white/70 p-4 dark:border-white/10">
          <div className="flex items-start gap-3">
            {/* Icon chip: ✨ + the land's landmark emoji. */}
            <span
              className={'grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xl ' + theme.chip}
              aria-hidden
            >
              {story.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className={'text-[11px] font-bold uppercase tracking-wider ' + theme.kicker}>
                ✨ New Story
              </div>
              <div className="font-display text-sm font-extrabold leading-snug text-zinc-800 dark:text-zinc-100">
                {story.title}
              </div>
              <div className="mt-0.5 text-xs leading-snug text-zinc-600 dark:text-zinc-400">
                {story.blurb}
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onDismiss}
              className="font-display rounded-full px-4 py-3 text-sm font-bold text-zinc-600 transition-[transform,color] duration-100 ease-out hover:text-zinc-800 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 dark:text-zinc-400 dark:hover:text-zinc-100"
              style={{ minHeight: 'var(--min-tap-target)' }}
            >
              Later
            </button>
            <button
              type="button"
              onClick={onWatch}
              className="candy-shell font-display rounded-full px-5 py-3 text-sm font-bold transition-[transform,box-shadow,filter] duration-100 ease-out active:scale-95"
              style={{
                minHeight: 'var(--min-tap-target)',
                '--c-from': 'var(--act-from)',
                '--c-to': 'var(--act-to)',
                '--c-ink': 'var(--act-ink)',
                '--c-glow': 'var(--act-glow)',
              } as React.CSSProperties}
            >
              See what happened →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
