// One item in the collection — found, or not yet.
//
// Presentational only, like UpdateCard: the page owns the data and decides what
// is visible, this decides what it looks like. Kept apart from the page so the
// same card can sit in whatever surface wants to show a collection later.

import type { BakingItem } from '@/lib/items/catalog';

export default function ItemCard({
  item,
  found,
}: {
  item: BakingItem;
  /** null when the kid does not have it yet. */
  found: { foundAt: string } | null;
}): React.ReactElement {
  if (!found) {
    // A silhouette is a promise, so it has to read as "not yet" rather than as
    // broken or disabled. Grayscale plus low opacity keeps the shape legible —
    // a kid should be able to guess what it is and want it.
    //
    // The note is withheld until it is found. That line is the little reward
    // for opening the chest, and printing it under a locked silhouette spends
    // it before the kid has earned it.
    return (
      <li className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-zinc-300 bg-white/40 px-2 py-3 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
        <span className="text-3xl opacity-25 grayscale sm:text-4xl" aria-hidden>
          {item.emoji}
        </span>
        <span className="font-display text-[11px] leading-tight font-bold text-zinc-400 dark:text-zinc-500">
          {item.name}
        </span>
      </li>
    );
  }

  return (
    <li className="flex flex-col items-center gap-1 rounded-xl border border-amber-200 bg-white px-2 py-3 text-center shadow-sm dark:border-amber-900/50 dark:bg-zinc-900">
      <span className="text-3xl sm:text-4xl" aria-hidden>
        {item.emoji}
      </span>
      <span className="font-display text-[11px] leading-tight font-bold text-zinc-800 dark:text-zinc-100">
        {item.name}
      </span>
      {/* The note stays on the card rather than behind a hover or a tap. This
          is played on an iPad: there is no hover, and a reward you have to
          discover a second time is not a reward. */}
      <span className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
        {item.note}
      </span>
    </li>
  );
}
