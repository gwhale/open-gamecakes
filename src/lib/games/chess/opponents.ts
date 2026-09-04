// The Cakey chess opponents — who you actually play in Chess Challenge.
//
// A plain content module in the same spirit as town/cakey-lines.ts: no React, no
// `three`, type-only imports. The persona lives here so it can be tuned without
// touching game logic, and so creative direction can edit names and voice
// without reading a search algorithm.
//
// ⚠️ NEW CHARACTERS. Gamecakes has had exactly two characters — Cakey and the
// kid's own cupcake. These five are a creative-direction decision wearing an
// engineering hat: the SHAPE below is the deliverable, the names and lines want a
// review before they meet a child.
//
// THE VOICE RULE, which is not negotiable:
//   Every line an opponent says about a mistake is about THEIR OWN good luck,
//   never the kid's failure. "Lucky me!" — never "that was a bad move." Cakey's
//   established voice is "funny at his OWN expense, never the child's", and an
//   opponent who gloats over a six-year-old's blunder is a different, worse game.
//
// ZERO NEW ART. This codebase has no sprite or image assets — every character is
// drawn from primitives. Four opponents are CupcakeConfig recipes fed to the
// existing CupcakeAvatar; one is Cakey himself via GamecakesMascot. The `avatar`
// discriminated union is what lets creative direction move anybody later without
// a code change.

import type { CupcakeConfig } from '@/lib/cupcake/config';
import type { CakeyMood } from '@/components/GamecakesMascot';
import type { BotConfig } from '@/lib/games/chess/bot';
import { startRatingForTier } from '@/lib/games/chess/rating';

/** How an opponent is drawn. Both arms render from existing components — adding
 *  a third kind should mean a new RENDERER, never a new image asset. */
export type OpponentAvatar =
  | { kind: 'cakey'; mood: CakeyMood }
  | { kind: 'cupcake'; config: CupcakeConfig };

export interface ChessOpponent {
  /** Stable forever — this is what a saved preference or a stat would key on. */
  id: string;
  name: string;
  /** Displayed "chess strength". A DIFFICULTY LABEL, not a measurement — see the
   *  warning at the top of bot.ts. Never call it a rating in kid-facing copy. */
  elo: number;
  /** Launcher levels this opponent covers. Every level 1–10 must be covered
   *  exactly once; there is a dev assertion for that at the bottom. */
  levels: readonly number[];
  /** One line for the launcher's level preview card. */
  blurb: string;
  avatar: OpponentAvatar;
  bot: BotConfig;
  lines: {
    greeting: readonly string[];
    /** The kid played a strong move. */
    goodMove: readonly string[];
    /** The kid dropped something. ABOUT THE OPPONENT'S LUCK — see the voice rule. */
    kidSlip: readonly string[];
    check: readonly string[];
    botWins: readonly string[];
    botLoses: readonly string[];
    draw: readonly string[];
  };
}

export const CHESS_OPPONENTS: readonly ChessOpponent[] = [
  {
    id: 'crumb',
    name: 'Crumb',
    elo: 500,
    levels: [1, 2],
    blurb: 'Crumb just learned how the horse moves. Be gentle.',
    avatar: {
      kind: 'cupcake',
      config: { base: 'cupcake', wrapper: 'vanilla', frosting: 'white', topping: 'none', variety: 'mini' },
    },
    // depth 1 cannot see the recapture, captureBias makes him grab everything,
    // and a third of his moves are random. He is meant to lose pieces.
    bot: {
      depth: 1,
      blunderPct: 0.35,
      blunderKind: 'random',
      captureBias: 120,
      slack: 150,
      takesMateIn1: false,
      guardsBigPieces: false,
      usesCentreBonus: false,
      nodeCap: 1500,
    },
    lines: {
      greeting: [
        'I know how the horse moves! Mostly.',
        'Be gentle. I am very small.',
        'I read a whole page of a chess book once.',
      ],
      goodMove: ['Ooh. That looked clever.', 'Hey! That was good.', 'How did you SEE that?'],
      kidSlip: ['Ha! Even I spotted that one.', 'Lucky me!', 'I think I just got away with something.'],
      check: ['Check! ...did I do that right?'],
      botWins: ['I WON? I won! Nobody tell Cakey.'],
      botLoses: ['You got me. Rematch? Please?', 'Good game! I will practise.'],
      draw: ['A tie! We both win. Sort of.'],
    },
  },
  {
    id: 'sprinkle',
    name: 'Sprinkle',
    elo: 700,
    levels: [3, 4],
    blurb: 'Sprinkle knows the traps now. Some of them.',
    avatar: {
      kind: 'cupcake',
      config: { base: 'cupcake', wrapper: 'strawberry', frosting: 'pink', topping: 'sprinkles', variety: 'classic' },
    },
    bot: {
      depth: 1,
      blunderPct: 0.2,
      blunderKind: 'random',
      captureBias: 60,
      slack: 100,
      takesMateIn1: true,
      guardsBigPieces: false,
      usesCentreBonus: true,
      nodeCap: 1500,
    },
    lines: {
      greeting: ['I have been practising!', 'Middle squares first. That is my whole plan.', 'Ready? I am ready.'],
      goodMove: ['Oh, that is annoying. Well played.', 'I did not expect that at all.'],
      kidSlip: ['Ooh, I will take that, thank you!', 'My lucky day.'],
      check: ['Check! I have been waiting to say that.'],
      botWins: ['I did it! I practised and it WORKED.'],
      botLoses: ['Ahh. Good game — you were better today.'],
      draw: ['A draw! Honestly, fair.'],
    },
  },
  {
    id: 'cakey',
    name: 'Cakey',
    elo: 950,
    levels: [5, 6],
    // Cakey is the house sparring partner, NOT the final boss. Making the warm,
    // self-deprecating mascot the hardest adversary would contradict the persona
    // established in town/cakey-lines.ts.
    blurb: 'Your old friend from town. He is better at this than he lets on.',
    avatar: { kind: 'cakey', mood: 'happy' },
    bot: {
      depth: 2,
      blunderPct: 0.12,
      blunderKind: 'second-best',
      captureBias: 20,
      slack: 60,
      takesMateIn1: true,
      guardsBigPieces: false,
      usesCentreBonus: true,
      nodeCap: 6000,
    },
    lines: {
      greeting: [
        'Oh good, a game. I have been standing in a field all week.',
        'I am mostly cake, but I am a LITTLE bit chess.',
        'Go easy. Or do not. I will cope.',
      ],
      goodMove: ['Now that is a proper move.', 'Ooh. I felt that one.', 'You have been practising. Rude.'],
      kidSlip: ['I will take that and say nothing.', 'Lucky me. Truly.', 'That one fell into my lap.'],
      check: ['Check. Sorry. Not sorry.'],
      botWins: ['I won! I am as surprised as you are.'],
      botLoses: ['Beaten by a cupcake. I have never been prouder.'],
      draw: ['A draw. Very civilised of us.'],
    },
  },
  {
    id: 'biscotti',
    name: 'Biscotti',
    elo: 1200,
    levels: [7, 8],
    blurb: 'Biscotti plays slowly and does not give things away.',
    avatar: {
      kind: 'cupcake',
      config: { base: 'cakepop', wrapper: 'lemon', frosting: 'lemon', topping: 'candle', variety: 'tall' },
    },
    bot: {
      depth: 2,
      blunderPct: 0.06,
      blunderKind: 'second-best',
      captureBias: 0,
      slack: 30,
      takesMateIn1: true,
      guardsBigPieces: true,
      usesCentreBonus: true,
      nodeCap: 6000,
    },
    lines: {
      greeting: ['Take your time. I always do.', 'A good game is a slow game.', 'Shall we think together?'],
      goodMove: ['Hm. Genuinely good.', 'I did not see that coming, and I look quite hard.'],
      kidSlip: ['I will accept that gift.', 'Fortune favours the patient.'],
      check: ['Check. Have a look around.'],
      botWins: ['A good game. You made me work for it.'],
      botLoses: ['Well played. I will be thinking about that one.'],
      draw: ['Even. That is a fine result.'],
    },
  },
  {
    id: 'chef-gateau',
    name: 'Chef Gâteau',
    elo: 1400,
    levels: [9, 10],
    blurb: 'The champion of Chess Island. Bring everything you have.',
    avatar: {
      kind: 'cupcake',
      config: { base: 'layered', wrapper: 'chocolate', frosting: 'chocolate', topping: 'star', variety: 'fancy' },
    },
    bot: {
      depth: 2,
      blunderPct: 0.02,
      blunderKind: 'second-best',
      captureBias: 0,
      slack: 10,
      takesMateIn1: true,
      guardsBigPieces: true,
      usesCentreBonus: true,
      nodeCap: 6000,
    },
    lines: {
      // Formal and warm. Never condescending — he treats the kid as a real player.
      greeting: [
        'You reached my table. That already means something.',
        'I will not go easy. That would be an insult.',
        'Let us make something worth watching.',
      ],
      goodMove: ['Excellent. Truly.', 'That is the move I feared.', 'You saw it. Very good.'],
      kidSlip: ['I will take it — but you had the better idea a moment ago.', 'A small door. I walked through it.'],
      check: ['Check. Show me what you have.'],
      botWins: ['A fine game. Come back and take it from me.'],
      botLoses: ['You beat me. I do not say that often — you have earned it.'],
      draw: ['A draw against me is a victory worth having.'],
    },
  },
];

/** Which opponent a launcher level faces. */
export function opponentForLevel(level: number): ChessOpponent {
  const lvl = Math.max(1, Math.min(10, Math.round(level)));
  return CHESS_OPPONENTS.find((o) => o.levels.includes(lvl)) ?? CHESS_OPPONENTS[0];
}

export function opponentById(id: string): ChessOpponent | undefined {
  return CHESS_OPPONENTS.find((o) => o.id === id);
}

/** Pick a line, avoiding an immediate repeat. Same contract as cakey-lines'
 *  pickLine — pass the previous index back in. */
export function pickOpponentLine(
  pool: readonly string[],
  excludeIndex = -1,
): { line: string; index: number } {
  if (pool.length === 0) return { line: '', index: -1 };
  let i = Math.floor(Math.random() * pool.length);
  if (pool.length > 1 && i === excludeIndex) i = (i + 1) % pool.length;
  return { line: pool[i], index: i };
}

if (process.env.NODE_ENV !== 'production') {
  // Every launcher level must map to exactly one opponent, or a kid picks a level
  // and faces the fallback without anything looking wrong.
  const seen = new Map<number, string>();
  for (const o of CHESS_OPPONENTS) {
    for (const lvl of o.levels) {
      const prior = seen.get(lvl);
      if (prior) console.warn(`[chess/opponents] level ${lvl} claimed by both ${prior} and ${o.id}`);
      seen.set(lvl, o.id);
    }
  }
  const missing = Array.from({ length: 10 }, (_, i) => i + 1).filter((l) => !seen.has(l));
  if (missing.length > 0) console.warn('[chess/opponents] levels with no opponent:', missing);

  // Opponents ride the SAME axis the puzzle ladder uses, so "level 7" means
  // comparable difficulty in either chess game. Drifting far from it means the
  // launcher's level number stops meaning anything consistent.
  for (const o of CHESS_OPPONENTS) {
    for (const lvl of o.levels) {
      const expected = startRatingForTier(lvl);
      if (Math.abs(expected - o.elo) > 260) {
        console.warn(
          `[chess/opponents] ${o.id} (${o.elo}) is far from the ladder's ${expected} at level ${lvl}`,
        );
      }
    }
  }
}
