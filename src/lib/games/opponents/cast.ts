// The Cakey opponent cast — who you play against, in any game that has an
// opponent.
//
// Hoisted out of chess/opponents.ts when checkers arrived. Gamecakes had exactly
// two characters for its whole life (Cakey and the kid's own cupcake); chess
// added five, and the right move for the second game was to REUSE them rather
// than invent five more. A cast that turns up in more than one game is how a
// cast becomes a world — and a kid who learned "Crumb is the gentle one" gets to
// keep knowing that.
//
// What lives here is only what is TRUE OF THE CHARACTER: who they are and how
// they are drawn. Everything game-specific — the blurb, the strength label, the
// bot config, the voice lines — stays in that game's own opponents module,
// because "Crumb at chess" and "Crumb at checkers" are the same person playing
// two different games.
//
// ZERO NEW ART. This codebase has no sprite or image assets. Four opponents are
// CupcakeConfig recipes fed to the existing CupcakeAvatar; one is Cakey himself
// via GamecakesMascot. The `avatar` union is what lets creative direction move
// anybody later without a code change.
//
// THE VOICE RULE, which is not negotiable and applies to every game's lines:
//   Every line an opponent says about a mistake is about THEIR OWN good luck,
//   never the kid's failure. "Lucky me!" — never "that was a bad move." An
//   opponent who gloats over a six-year-old's blunder is a different, worse game.

import type { CupcakeConfig } from '@/lib/cupcake/config';
import type { CakeyMood } from '@/components/GamecakesMascot';

/** How an opponent is drawn. Both arms render from existing components — adding
 *  a third kind should mean a new RENDERER, never a new image asset. */
export type OpponentAvatar =
  | { kind: 'cakey'; mood: CakeyMood }
  | { kind: 'cupcake'; config: CupcakeConfig };

export interface CastMember {
  /** Stable forever — saved preferences and stats key on this. */
  id: string;
  name: string;
  avatar: OpponentAvatar;
}

/** Ordered easiest to hardest. Games map their own level ranges onto this order;
 *  the order itself is the shared difficulty language. */
export const CAST: readonly CastMember[] = [
  {
    id: 'crumb',
    name: 'Crumb',
    avatar: {
      kind: 'cupcake',
      config: { base: 'cupcake', wrapper: 'vanilla', frosting: 'white', topping: 'none', variety: 'mini' },
    },
  },
  {
    id: 'sprinkle',
    name: 'Sprinkle',
    avatar: {
      kind: 'cupcake',
      config: { base: 'cupcake', wrapper: 'strawberry', frosting: 'pink', topping: 'sprinkles', variety: 'classic' },
    },
  },
  {
    // The house sparring partner, NOT the final boss — see chess/opponents.ts.
    id: 'cakey',
    name: 'Cakey',
    avatar: { kind: 'cakey', mood: 'happy' },
  },
  {
    id: 'biscotti',
    name: 'Biscotti',
    avatar: {
      kind: 'cupcake',
      config: { base: 'cakepop', wrapper: 'lemon', frosting: 'lemon', topping: 'candle', variety: 'tall' },
    },
  },
  {
    id: 'chef-gateau',
    name: 'Chef Gâteau',
    avatar: {
      kind: 'cupcake',
      config: { base: 'layered', wrapper: 'chocolate', frosting: 'chocolate', topping: 'star', variety: 'fancy' },
    },
  },
];

export function castMember(id: string): CastMember | undefined {
  return CAST.find((c) => c.id === id);
}

/** Pick a line, avoiding an immediate repeat. Same contract as
 *  town/cakey-lines.ts — the caller keeps the returned index and hands it back
 *  next time. */
export function pickOpponentLine(pool: readonly string[], excludeIndex = -1): { line: string; index: number } {
  if (pool.length === 0) return { line: '', index: -1 };
  let i = Math.floor(Math.random() * pool.length);
  if (pool.length > 1 && i === excludeIndex) i = (i + 1) % pool.length;
  return { line: pool[i], index: i };
}

/** Every launcher level 1–10 must map to exactly one opponent, or a kid picks a
 *  level and faces a fallback without anything looking wrong. Called from each
 *  game's dev assertion block. */
export function assertLevelCoverage(tag: string, entries: ReadonlyArray<{ id: string; levels: readonly number[] }>): void {
  const seen = new Map<number, string>();
  for (const o of entries) {
    for (const lvl of o.levels) {
      const prior = seen.get(lvl);
      if (prior) console.warn(`[${tag}] level ${lvl} claimed by both ${prior} and ${o.id}`);
      seen.set(lvl, o.id);
    }
  }
  const missing = Array.from({ length: 10 }, (_, i) => i + 1).filter((l) => !seen.has(l));
  if (missing.length > 0) console.warn(`[${tag}] levels with no opponent:`, missing);
}
