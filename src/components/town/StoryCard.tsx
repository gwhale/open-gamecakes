'use client';

// StoryCard — the narrated "storybook" panel for a Story Alert.
//
// Opened from the Story Alert toast's "See what happened" (and, in PR B, used
// as the reduced-motion / skip fallback for the camera cutscene). It reuses the
// exact CakeyPanel visual family (full-screen backdrop, Cakey + speech bubble,
// ▶ Next stepper) so it reads like the rest of Cakey's talk UI — the kid taps
// through the story's Cakey-voiced beats one at a time.
//
// On open it fires `onReveal` once (the host wires this to the land's in-world
// reveal shimmer, but ONLY when the kid has already discovered that land —
// revealRegion also unblocks entry, so an unpaid land is never re-revealed).

import { useEffect, useState } from 'react';
import GamecakesMascot, { type CakeyMood } from '@/components/GamecakesMascot';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import type { StoryEvent } from '@/lib/town/story-events';

interface StoryCardProps {
  story: StoryEvent;
  /** Fired once when the card opens — the host uses it to shimmer the land in
   *  the 3D world. Undefined when there's nothing safe to reveal. */
  onReveal?: () => void;
  /** Close the card (last beat's "The end!" or the × / backdrop tap). */
  onDone: () => void;
}

export default function StoryCard({ story, onReveal, onDone }: StoryCardProps): React.ReactElement {
  const [beatIdx, setBeatIdx] = useState(0);

  // Fire the in-world reveal shimmer once, on open. Runs after paint so it never
  // blocks the card appearing.
  useEffect(() => {
    onReveal?.();
    // Open-once effect — onReveal is stable for the card's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const beats = story.beats;
  const isLast = beatIdx >= beats.length - 1;
  const mood: CakeyMood = isLast ? 'celebrate' : 'happy';

  // Keyboard dismiss to match the backdrop tap / Close button.
  useEscapeKey(onDone);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 p-4 pb-8 backdrop-blur-[2px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={story.title}
      onClick={onDone}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl dark:bg-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title strip — the WHAT, so the kid knows what they're watching. */}
        <div className="mb-3 flex items-center gap-2">
          <span className="text-2xl" aria-hidden>
            {story.icon}
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
            New Story
          </span>
        </div>

        {/* Header: Cakey + the current beat as his speech bubble. */}
        <div className="mb-4 flex items-end gap-3">
          <GamecakesMascot mood={mood} size={72} />
          <div
            key={beatIdx}
            className="animate-cakey-pop relative flex-1 rounded-3xl rounded-bl-md bg-amber-50 px-4 py-3 text-sm font-semibold text-zinc-800 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
          >
            {beats[Math.min(beatIdx, beats.length - 1)]}
            <span
              className="absolute -bottom-2 left-4 h-0 w-0 border-l-8 border-t-8 border-transparent border-t-amber-50 dark:border-t-zinc-700"
              aria-hidden
            />
          </div>
        </div>

        {/* Progress dots so the kid sees how many beats are left. */}
        <div className="mb-4 flex justify-center gap-1.5" aria-hidden>
          {beats.map((_, i) => (
            <span
              key={i}
              className={
                'h-1.5 rounded-full transition-all ' +
                (i === beatIdx ? 'w-4 bg-rose-400' : 'w-1.5 bg-zinc-300 dark:bg-zinc-600')
              }
            />
          ))}
        </div>

        <div className="flex justify-center gap-3">
          {!isLast ? (
            <button
              type="button"
              onClick={() => setBeatIdx((n) => n + 1)}
              className="rounded-full bg-rose-400 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-rose-500 active:scale-95"
              style={{ minHeight: 'var(--min-tap-target)' }}
            >
              ▶ Next
            </button>
          ) : (
            <button
              type="button"
              onClick={onDone}
              className="rounded-full bg-emerald-400 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-500 active:scale-95"
              style={{ minHeight: 'var(--min-tap-target)' }}
            >
              🍰 The end!
            </button>
          )}
          <button
            type="button"
            onClick={onDone}
            className="rounded-full bg-zinc-200 px-5 py-3 text-sm font-bold text-zinc-700 transition hover:bg-zinc-300 active:scale-95 dark:bg-zinc-700 dark:text-zinc-200"
            style={{ minHeight: 'var(--min-tap-target)' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
