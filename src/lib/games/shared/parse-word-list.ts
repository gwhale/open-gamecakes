// What a grown-up typed into the word box, turned into words and meanings.
//
// Lives here rather than in the route because it is the part worth testing: a
// pure string-in, structure-out function with real edge cases (hyphens,
// commas inside a definition, the same word twice), and importing the route to
// reach it would drag in next/server and a Supabase client for no reason.
//
// THE FORMAT IS WHATEVER CAME HOME IN THE BACKPACK
//
// A parent is copying off a sheet at the kitchen table, not filling in a form.
// So a bare list works, a comma-separated run on one line works, and a list
// with meanings works, in any mix. The only rule that matters is that a line
// carrying a separator keeps everything after it as the meaning, commas
// included, because definitions have commas in them and word lists do not.

/** A line carrying a definition: "brave = not afraid", "brave: not afraid",
 *  "brave - not afraid".
 *
 *  The dash form requires whitespace on BOTH sides so a hyphenated word
 *  ("well-known = famous") splits on the equals rather than inside itself.
 *  Non-greedy on the left so the FIRST separator wins: "a = b = c" is the word
 *  "a" meaning "b = c", which is the reading a parent intends. */
const PAIR = /^\s*(.+?)\s*(?:[=:]|\s[-–—]\s)\s*(.+?)\s*$/;

/** A "list" past this length is a paste accident, not a spelling list. */
export const MAX_WORDS = 60;

export interface ParsedWordList {
  words: string[];
  /** Lowercased word -> definition. Only the words a grown-up defined. */
  glosses: Record<string, string>;
}

export function parseWordList(raw: unknown): ParsedWordList {
  const text = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.join('\n') : '';
  const seen = new Set<string>();
  const words: string[] = [];
  const glosses: Record<string, string> = {};

  const push = (word: string, gloss: string | null) => {
    const w = word.trim();
    if (!w) return;
    const key = w.toLocaleLowerCase();
    const g = gloss?.trim();
    // A definition is kept even when the word is a duplicate: someone who
    // typed it twice and defined it once meant the fuller entry.
    if (g && !glosses[key]) glosses[key] = g;
    if (seen.has(key)) return;
    if (words.length >= MAX_WORDS) return;
    seen.add(key);
    words.push(w);
  };

  for (const line of text.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const pair = PAIR.exec(trimmed);
    if (pair) push(pair[1], pair[2]);
    // No separator, so this is still allowed to be a comma-separated run of
    // bare words. That is how the box worked before meanings existed, and it
    // is how people paste.
    else for (const piece of trimmed.split(/[,;]+/)) push(piece, null);
  }

  return { words, glosses };
}
