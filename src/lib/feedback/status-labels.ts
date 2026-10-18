// Kid-friendly status labels for the feedback ticket journey.
//
// This is the pedagogical centerpiece of the ticketing system — the words
// the kid sees ARE the lesson. In a "real" engineering org, tickets move
// through states like:
//
//   new      → an engineer has not yet looked at it
//   reviewed → an engineer has triaged and agreed it's real
//   done     → the fix has shipped
//   wontfix  → the team decided not to build this
//
// Adults understand those. Kids learn by analogy. The labels below translate
// each engineering state into "Story Oven" baking stages a 6–8-year-old can
// internalize (mixing bowl → in the oven → fresh out), then bridge to the real
// vocabulary via the `realWord` field so when they eventually hear "that ticket
// got closed as wontfix," they already have the concept.
//
// Design tradeoffs to think about (tweak freely):
//   1. Cute vs. "real" vocabulary. Too cute ("sleeping") and they miss the
//      engineering analogy. Too literal ("triaged") and it doesn't land.
//   2. Emojis should reinforce, not compete with, the text.
//   3. The "tooltip" doubles as the teaching moment — this is the sentence
//      a parent might read aloud when the kid first sees this status.

import type { FeedbackStatus } from '@/lib/types';

export interface KidStatusLabel {
  /** Short emoji that represents the state at a glance. */
  emoji: string;
  /** Kid-friendly label shown as the primary UI text. */
  label: string;
  /** The "real" engineering word — shown underneath in parens or a tooltip
   *  so kids learn the actual vocabulary over time. */
  realWord: FeedbackStatus;
  /** One-sentence teaching text. Explains what this state means in kid terms. */
  tooltip: string;
  /** Tailwind color family for chips, bars, and badges. */
  color: {
    bg: string;     // background class, e.g. 'bg-amber-100'
    text: string;   // text class,       e.g. 'text-amber-900'
    ring: string;   // ring class,       e.g. 'ring-amber-300'
  };
}

export const KID_STATUS_LABELS: Record<FeedbackStatus, KidStatusLabel> = {
  new: {
    emoji: '🥣',
    label: 'In the mixing bowl',
    realWord: 'new',
    tooltip: 'Your recipe is in the mixing bowl. A grown-up baker will get to it soon!',
    color: {
      bg: 'bg-sky-100 dark:bg-sky-950',
      text: 'text-sky-900 dark:text-sky-100',
      ring: 'ring-sky-300 dark:ring-sky-700',
    },
  },
  reviewed: {
    emoji: '🔥',
    label: 'In the oven',
    realWord: 'reviewed',
    tooltip: 'A grown-up baker read your recipe and popped it in the oven.',
    color: {
      bg: 'bg-amber-100 dark:bg-amber-950',
      text: 'text-amber-900 dark:text-amber-100',
      ring: 'ring-amber-300 dark:ring-amber-700',
    },
  },
  done: {
    emoji: '🧁',
    label: 'Fresh out of the oven!',
    realWord: 'done',
    tooltip: 'Your idea is baked and live in the game! Check the note to see what came out.',
    color: {
      bg: 'bg-emerald-100 dark:bg-emerald-950',
      text: 'text-emerald-900 dark:text-emerald-100',
      ring: 'ring-emerald-300 dark:ring-emerald-700',
    },
  },
  wontfix: {
    emoji: '🍽️',
    label: 'Saved for later',
    realWord: 'wontfix',
    tooltip: "We didn't bake this one this time. That's okay — not every recipe makes it to the oven!",
    color: {
      bg: 'bg-zinc-100 dark:bg-zinc-900',
      text: 'text-zinc-700 dark:text-zinc-300',
      ring: 'ring-zinc-300 dark:ring-zinc-700',
    },
  },
};

/** The journey order kids see as a progress indicator. `wontfix` is a
 *  branch off the main happy path, so it's not included here. */
export const STATUS_JOURNEY: FeedbackStatus[] = ['new', 'reviewed', 'done'];

/** Ticket-type → kid-friendly label. Separate from status. */
export const KID_TYPE_LABELS: Record<'bug' | 'feature' | 'feedback', { emoji: string; label: string }> = {
  bug:      { emoji: '🐛', label: 'Bug to squash' },
  feature:  { emoji: '✨', label: 'New idea' },
  feedback: { emoji: '💬', label: 'A thought' },
};
