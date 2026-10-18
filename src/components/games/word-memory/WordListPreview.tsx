// Word-list preview — the 10 words of a list as chips, shown under the
// level grid in the Word Memory launcher so pickers (parents, the /ba
// audience) can see exactly what they're choosing before starting.
// Pure presentational; used by both the gated and /ba shells via
// GameLauncher's `levelPreview` render prop.

import { WORD_LISTS } from './word-lists';

export default function WordListPreview({ listId }: { listId: number }) {
  const words = WORD_LISTS[listId] ?? WORD_LISTS[1];

  return (
    <div className="mt-3 rounded-xl bg-white/80 px-4 py-3 dark:bg-zinc-900/80">
      <div className="text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        Words in list {listId}
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-1.5">
        {words.map((w) => (
          <span
            key={w}
            className="rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-900 dark:bg-blue-950 dark:text-blue-200"
          >
            {w}
          </span>
        ))}
      </div>
    </div>
  );
}
