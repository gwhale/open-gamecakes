'use client';

// The corner Cakey that reacts while a kid answers questions. Mounted once in
// the (gated) and /play layouts; renders nothing until ChallengeInput emits.
// See src/lib/games/shared/cakey-react.ts for the rules and why this lives
// outside the question dialog.
//
// pointer-events-none throughout: bottom corners hold game controls (Math
// Asteroids' fire button), so Cakey may cover one for a moment but can never
// swallow a tap.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import GamecakesMascot from '@/components/GamecakesMascot';
import {
  REACTION_LINES as LINES,
  THINK_AFTER_MS,
  hasSideCakey,
  publishReaction,
  reactToAnswer,
  subscribeCakeyEvents,
  subscribeCakeyView,
  type CakeyReaction as Shown,
} from '@/lib/games/shared/cakey-react';

/** How long a one-off reaction stays up. Think stays until the kid acts. */
const HOLD_MS: Record<Exclude<Shown, 'think'>, number> = { oops: 1600, celebrate: 1200 };

export default function CakeyReactions() {
  const [shown, setShown] = useState<Shown | null>(null);
  const wrongStreak = useRef(0);
  const thinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The question card's own Cakey is on screen and shows the reaction itself.
  const side = useSyncExternalStore(subscribeCakeyView, hasSideCakey, () => false);

  useEffect(() => {
    publishReaction(shown);
  }, [shown]);
  useEffect(() => () => publishReaction(null), []);

  useEffect(() => {
    const stopThink = () => {
      if (thinkTimer.current) clearTimeout(thinkTimer.current);
      thinkTimer.current = null;
      setShown((s) => (s === 'think' ? null : s));
    };
    const armThink = () => {
      stopThink();
      thinkTimer.current = setTimeout(() => setShown('think'), THINK_AFTER_MS);
    };
    const flash = (mood: Exclude<Shown, 'think'>) => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
      setShown(mood);
      holdTimer.current = setTimeout(() => setShown(null), HOLD_MS[mood]);
    };

    const off = subscribeCakeyEvents((event) => {
      switch (event.type) {
        case 'question-open':
        case 'activity':
          armThink();
          break;
        case 'question-close':
          stopThink();
          break;
        case 'answered': {
          stopThink();
          const r = reactToAnswer(event.correct, wrongStreak.current);
          wrongStreak.current = r.wrongStreak;
          if (r.show) flash(r.show);
          break;
        }
      }
    });
    return () => {
      off();
      if (thinkTimer.current) clearTimeout(thinkTimer.current);
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
  }, []);

  return (
    <div
      className="pointer-events-none fixed bottom-3 left-3 z-[60] flex items-end gap-2 sm:bottom-5 sm:left-5"
      aria-live="polite"
    >
      {/* With the side Cakey showing it, the line stays here for screen
          readers only, so the announcement is unchanged. */}
      {shown && side ? <span className="sr-only">{LINES[shown]}</span> : null}
      {shown && !side ? (
        <>
          <GamecakesMascot size={88} mood={shown} aria-label={`Cakey: ${LINES[shown]}`} />
          <div className="mb-14 max-w-[11rem] rounded-2xl bg-white/95 px-3 py-2 text-sm font-bold text-zinc-800 shadow-lg dark:bg-zinc-900/95 dark:text-zinc-100">
            {LINES[shown]}
          </div>
        </>
      ) : null}
    </div>
  );
}
