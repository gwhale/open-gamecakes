'use client';

// Cakey Checkers — the React side of the 3D board.
//
// The host owns NO game state and the engine owns NO React state. Everything
// crossing the line does so through CheckersCallbacks, and the only thing that
// travels back is resize/pause/resign.
//
// `three` and the engine are dynamic-imported together inside the effect, so
// neither reaches any bundle that does not open this route — the rule from
// lib/games/three/types.ts.
//
// HOW A CHECKERS GAME BECOMES A SessionSummary. That type was designed for "N
// discrete answers, some wrong", and checkers has no answers, so this is an
// honest reinterpretation rather than a natural fit — the same one Chess
// Challenge makes:
//
//     a "tap"      = one KID TURN, chain included. A triple jump is ONE
//                    decision, not three.
//     taps_wrong   = a flagged turn (see gradeKidTurn in the engine)
//     optimal_taps = total kid turns
//     efficiency   = sound turns / kid turns
//
// WIN/LOSS IS DELIBERATELY NOT IN EFFICIENCY, for Chess Challenge's three
// reasons: the opponent's tier already decides win probability so a result-based
// metric would mostly measure which Cakey the kid picked; it is binary, so
// mastery would become a high-variance coin flip; and move quality is the part a
// kid can actually improve. The result still LEADS the game-over card, because
// that is where it belongs emotionally.

import { useEffect, useRef, useState } from 'react';
import OpponentBadge from '@/components/games/opponents/OpponentBadge';
import { pickOpponentLine } from '@/lib/games/opponents/cast';
import { opponentForLevel } from '@/lib/games/checkers/opponents';
import type { CheckersEngine, CheckersOutcome } from '@/lib/games/checkers/types';
import type { Side } from '@/lib/games/checkers/rules';
import { buildSessionSummary, type SessionSummary } from '@/lib/games/phaser/session';

export default function CakeyCheckersGame({
  level,
  styleId,
  kidSide,
  onComplete,
}: {
  level: number;
  styleId: string;
  kidSide: Side;
  onComplete: (s: SessionSummary) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<CheckersEngine | null>(null);
  const doneRef = useRef(false);
  const lineIndex = useRef<Record<string, number>>({});

  const foe = opponentForLevel(level);
  const [say, setSay] = useState('');
  const [thinking, setThinking] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [viewMoved, setViewMoved] = useState(false);
  const [tilt, setTilt] = useState<'tilted' | 'low' | 'top'>('tilted');

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    let disposed = false;
    const started = Date.now();

    // A fresh seed per game, logged in dev only — without it, "the bot gave away
    // a king on move 12" is an unreproducible bug report.
    const seed = (Math.random() * 0xffffffff) >>> 0;
    if (process.env.NODE_ENV !== 'production') console.info('[cakey-checkers] seed', seed);

    void (async () => {
      const [THREE, { createCheckersEngine }] = await Promise.all([
        import('three'),
        import('@/lib/games/checkers/engine'),
      ]);
      if (disposed) return;

      const engine = createCheckersEngine(
        THREE,
        el,
        { level, styleId, kidSide, seed },
        {
          onTurn() {
            // Tallies live in the engine; nothing to mirror into React per turn,
            // and re-rendering the tree on every move would be wasteful.
          },
          onAnnounce: setAnnounce,
          onThinking: setThinking,
          onViewMoved: setViewMoved,
          onOpponentLine(pool) {
            const lines = foe.lines[pool as keyof typeof foe.lines];
            if (!lines) return;
            const { line, index } = pickOpponentLine(lines, lineIndex.current[pool] ?? -1);
            lineIndex.current[pool] = index;
            setSay(line);
          },
          onGameOver(outcome, o: CheckersOutcome) {
            if (doneRef.current) return;
            doneRef.current = true;
            const sound = Math.max(0, o.kidTurns - o.flaggedTurns);
            const headline =
              outcome === 'win'
                ? `🏆 You beat ${foe.name}!`
                : outcome === 'loss'
                  ? `${foe.name} won this one.`
                  : "It's a draw!";
            const meta = [headline, `✅ ${sound} of ${o.kidTurns} moves were solid`];
            if (o.kidCrownings > 0) meta.push(`👑 ${o.kidCrownings} crowned`);
            onComplete(
              buildSessionSummary({
                score: o.kidCaptures,
                wrongAnswers: o.flaggedTurns,
                sessionStart: started,
                // A resignation is not a completed round.
                completed: o.reason !== 'resigned',
                optimalTaps: Math.max(1, o.kidTurns),
                metaLines: meta,
              }),
            );
          },
        },
      );
      engineRef.current = engine;

      const onResize = () => engine.resize();
      window.addEventListener('resize', onResize);
      // Fullscreen changes the container a frame or two AFTER the event, so the
      // fit has to wait for it — same delay pit stop uses.
      const onFs = () => window.setTimeout(onResize, 120);
      document.addEventListener('fullscreenchange', onFs);

      engineRef.current = {
        ...engine,
        dispose() {
          window.removeEventListener('resize', onResize);
          document.removeEventListener('fullscreenchange', onFs);
          engine.dispose();
        },
      };
    })();

    return () => {
      disposed = true;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [level, styleId, kidSide, foe, onComplete]);

  return (
    <div className="flex w-full flex-col gap-3">
      <OpponentBadge
        name={foe.name}
        avatar={foe.avatar}
        // A belt, not a number. See checkers/opponents.ts.
        strengthLabel={foe.belt}
        say={say}
        thinking={thinking}
      />

      {/* The canvas. touch-none because the engine owns the pointer for tapping
          and peeking, and a browser scroll gesture on top of that is unusable. */}
      <div
        ref={mountRef}
        className="w-full touch-none overflow-hidden rounded-2xl bg-[#fff4e2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
        style={{ aspectRatio: '1 / 1' }}
        tabIndex={0}
        role="application"
        aria-label={`Checkers board. You are playing ${kidSide === 'dark' ? 'chocolate' : 'cream'} against ${foe.name}.`}
      />

      {/* Every move in plain words. Full keyboard board navigation is a known
          follow-up; this is what makes the game FOLLOWABLE without sight in the
          meantime, and it costs one div. */}
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>

      {/* Camera controls.
          Dragging the board already turns it, but a drag is not reachable by
          keyboard and is not obvious to a six-year-old, so every camera move has
          a button too. "Straighten up" is the important one — it is what makes
          free rotation safe, because a kid who spun the board round and lost
          track of their own pieces needs exactly one thing to press. */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Camera">
        <CamButton onClick={() => engineRef.current?.spinView(-45)} label="Turn the board left">
          <span aria-hidden>⟲</span>
        </CamButton>
        <CamButton onClick={() => engineRef.current?.spinView(45)} label="Turn the board right">
          <span aria-hidden>⟳</span>
        </CamButton>
        <CamButton
          onClick={() => {
            const next = engineRef.current?.cycleTilt();
            if (next) setTilt(next);
          }}
          label={`Change the angle. Now: ${TILT_LABEL[tilt]}`}
        >
          <span aria-hidden>⛰</span>
          <span className="ml-1 text-xs font-semibold">{TILT_LABEL[tilt]}</span>
        </CamButton>
        <CamButton
          onClick={() => {
            engineRef.current?.setView('home');
            setTilt('tilted');
          }}
          label="Straighten up — put your pieces back at the front"
          // Disabled rather than hidden: a control that appears and vanishes is
          // harder for a kid to learn than one that is simply greyed out, and a
          // moving button is a moving tap target.
          disabled={!viewMoved}
        >
          <span aria-hidden>⌂</span>
          <span className="ml-1 text-xs font-semibold">Straighten</span>
        </CamButton>

        <button
          type="button"
          onClick={() => engineRef.current?.resign()}
          className="ml-auto rounded-full border border-stone-300 bg-white/80 px-4 py-2 text-sm font-medium text-stone-600 shadow-sm active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
          style={{ minHeight: 'var(--min-tap-target)' }}
        >
          I&rsquo;m done
        </button>
      </div>
      <p className="text-center text-xs text-stone-500 dark:text-stone-400">
        Drag the board to look around it. Pinch to zoom.
      </p>
    </div>
  );
}

const TILT_LABEL = { tilted: 'Tilted', low: 'Low', top: 'Above' } as const;

/** A camera button. Icon plus a real label, 44px, with a visible focus ring —
 *  the three things the July 2026 button audit found missing sitewide. */
function CamButton({
  onClick,
  label,
  disabled,
  children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex items-center rounded-full border border-stone-300 bg-white/85 px-3 py-2 text-base font-medium text-stone-700 shadow-sm transition active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:cursor-default disabled:opacity-40 disabled:active:scale-100"
      style={{ minHeight: 'var(--min-tap-target)', minWidth: 'var(--min-tap-target)' }}
    >
      {children}
    </button>
  );
}
