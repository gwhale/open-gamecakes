// Games belonging to THIS deployment.
//
// ─────────────────────────────────────────────────────────────────────────────
// UPSTREAM NEVER EDITS THIS FILE. That is its entire purpose.
// ─────────────────────────────────────────────────────────────────────────────
//
// `GAME_REGISTRY` in ./registry.ts is upstream's list. If you added your own
// games there, every upstream release that adds a game would collide with
// yours, in the middle of the same array — the single most likely merge
// conflict in the project, because "build a game with your kid" is the point.
//
// So put yours here instead. `git merge upstream/main` will never touch this
// file, and your games survive every update untouched.
//
// Adding one:
//
//   1. Build the game under src/app/(gated)/games/<your-slug>/ — a directory
//      upstream does not know exists, so nothing there can conflict either.
//   2. Add an entry below. The slug MUST match the directory name.
//   3. Place it in the town via src/lib/town/regions.ts. That file IS shared
//      with upstream, so keep your edit small and expect the occasional
//      "keep both" resolution there.
//
// See docs/creating-a-new-game.md for the rest, and docs/UPDATING.md for how
// this fits into taking updates.

import type { GameInfo } from './registry';

/** Your deployment's own games. Empty upstream — that is correct, not an
 *  oversight. Append yours and they will be picked up everywhere the registry
 *  is used: the town, All Games, the ticket picker, unlock costs. */
export const LOCAL_GAMES: readonly GameInfo[] = [
  // Example — delete the comment markers and edit:
  //
  // { slug: 'rocket-fractions', label: 'Rocket Fractions', glyph: '🚀',
  //   subject: 'math', wordsMode: false },
];
