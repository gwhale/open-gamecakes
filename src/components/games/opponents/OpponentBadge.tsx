'use client';

// The opponent's face, name, strength label and speech bubble.
//
// Hoisted out of chess-challenge/ when checkers arrived, and generalised on one
// axis: the strength label is now a PROP rather than the hardcoded "chess
// strength {elo}". Chess passes a number it admits is a difficulty label;
// checkers passes a belt, because checkers is a solved game and any number we
// printed would over-claim (see checkers/bot.ts).
//
// Renders whichever primitive the cast names — CupcakeAvatar for the four pastry
// characters, GamecakesMascot for Cakey. There are no image assets in this
// codebase and this component must not introduce the first one.

import GamecakesMascot from '@/components/GamecakesMascot';
import { CupcakeAvatar } from '@/components/cupcake/CupcakeAvatar';
import type { OpponentAvatar } from '@/lib/games/opponents/cast';

export function OpponentFace({ avatar, size = 56 }: { avatar: OpponentAvatar; size?: number }) {
  if (avatar.kind === 'cakey') return <GamecakesMascot size={size} mood={avatar.mood} />;
  return <CupcakeAvatar config={avatar.config} size={size} />;
}

export default function OpponentBadge({
  name,
  avatar,
  strengthLabel,
  say,
  thinking,
}: {
  name: string;
  avatar: OpponentAvatar;
  /** e.g. "chess strength 950" or "Cocoa Belt". Never the word "rating". */
  strengthLabel: string;
  say: string;
  thinking: boolean;
}) {
  return (
    <div className="flex w-full items-center gap-3">
      <OpponentFace avatar={avatar} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-bold text-stone-800 dark:text-stone-100">{name}</span>
          <span className="shrink-0 text-xs text-stone-500 dark:text-stone-400">{strengthLabel}</span>
        </div>
        <p className="mt-0.5 min-h-[1.5rem] text-sm text-stone-600 dark:text-stone-300" aria-live="polite">
          {thinking ? `${name} is thinking…` : say}
        </p>
      </div>
    </div>
  );
}
