'use client';

// The opponent's face, name, strength and speech bubble, above the board.
//
// Renders whichever primitive the roster names — CupcakeAvatar for the four
// pastry characters, GamecakesMascot for Cakey. There are no image assets in
// this codebase and this component must not introduce the first one.

import GamecakesMascot from '@/components/GamecakesMascot';
import { CupcakeAvatar } from '@/components/cupcake/CupcakeAvatar';
import type { ChessOpponent, OpponentAvatar } from '@/lib/games/chess/opponents';

export function OpponentFace({ avatar, size = 56 }: { avatar: OpponentAvatar; size?: number }) {
  if (avatar.kind === 'cakey') return <GamecakesMascot size={size} mood={avatar.mood} />;
  return <CupcakeAvatar config={avatar.config} size={size} />;
}

export default function OpponentBadge({
  opponent,
  say,
  thinking,
}: {
  opponent: ChessOpponent;
  say: string;
  thinking: boolean;
}) {
  return (
    <div className="flex w-full items-center gap-3">
      <OpponentFace avatar={opponent.avatar} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-bold text-stone-800 dark:text-stone-100">{opponent.name}</span>
          {/* "chess strength", never "rating" — the number is a difficulty label
              and a 2-ply material engine is not a rated player. See bot.ts. */}
          <span className="shrink-0 text-xs text-stone-500 dark:text-stone-400">
            chess strength {opponent.elo}
          </span>
        </div>
        <p
          className="mt-0.5 min-h-[1.5rem] text-sm text-stone-600 dark:text-stone-300"
          aria-live="polite"
        >
          {thinking ? `${opponent.name} is thinking…` : say}
        </p>
      </div>
    </div>
  );
}
