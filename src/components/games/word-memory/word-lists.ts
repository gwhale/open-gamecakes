// Dolch-style sight-word lists 1–10, matching the original HTML prototype
// the user remixed. Tier N plays List N. Tier 1 is kindergarten-friendly;
// Tier 10 has early-2nd-grade words like "because" and "mother."
//
// Each list is exactly 10 words. The memory-game board uses 10 pairs
// (= 20 cards) plus 2 extra pairs built from the first two words (= 4 more
// cards), filling a 5×5 grid with the center cell left blank.

export const WORD_LISTS: Record<number, readonly string[]> = {
  1:  ['the', 'I', 'to', 'a', 'is', 'my', 'go', 'me', 'like', 'on'],
  2:  ['in', 'so', 'we', 'it', 'and', 'up', 'at', 'see', 'he', 'do'],
  3:  ['you', 'an', 'can', 'no', 'am', 'went', 'are', 'this', 'look', 'for'],
  4:  ['get', 'come', 'got', 'play', 'was', 'had', 'they', 'will', 'too', 'all'],
  5:  ['be', 'as', 'ball', 'by', 'day', 'did', 'has', 'her', 'him', 'fun'],
  6:  ['eat', 'if', 'jump', 'man', 'or', 'not', 'mom', 'out', 'now', 'of'],
  7:  ['put', 'ran', 'sat', 'read', 'run', 'she', 'sit', 'then', 'his', 'say'],
  8:  ['us', 'yes', 'saw', 'girl', 'how', 'when', 'your', 'about', 'from', 'than'],
  9:  ['away', 'them', 'came', 'big', 'been', 'after', 'who', 'back', "I'm", 'because'],
  10: ['very', 'could', 'have', 'make', 'any', 'into', 'there', 'were', 'mother', 'just'],
};

export const LIST_COUNT = Object.keys(WORD_LISTS).length;
export const CARDS_TOTAL = 24;  // 5×5 − 1 center blank
export const PAIRS_TOTAL = 12;  // 24 / 2
