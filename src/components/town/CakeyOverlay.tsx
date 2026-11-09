'use client';

// CakeyOverlay — the DOM layer for the wandering town mascot.
//
// Two parts, both above the 3D canvas:
//   1. A FOLLOW BUBBLE that tracks Cakey's projected screen position (fed by the
//      engine's throttled onCakeyMove report, read here via a ref + rAF so the
//      bubble tracks every frame WITHOUT re-rendering React — same trick the
//      Minimap uses). It shows short ambient persona lines while he roams.
//   2. The TALK (CakeyTalk, opened when the kid taps Cakey): a letterbox with
//      Quick trivia (reuses pickQuestion), What's new from the Story Oven
//      (reuses WHATS_NEW), and Just saying hi. Its full-screen backdrop also
//      swallows canvas taps, so the kid can't walk while Cakey is talking.
//
// The panel's OPEN state is owned by the host (flipped in the engine's onCakeyTap
// callback); the panel is mounted only while open, so its inner mode always
// starts fresh at the menu. All of Cakey's WORDS live in @/lib/town/cakey-lines;
// the engine only ever tells us WHERE he is and WHEN he's tapped.

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import {
  AMBIENT_LINES,
  SOCKS_AND_SHOES_LINES,
  SUBMARINE_LINES,
  NOTICE_PLAYER_LINES,
  WEATHER_LINES,
  pickLine,
} from '@/lib/town/cakey-lines';
import type { CakeyMoveInfo } from '@/lib/town/three/engine';
import type { WeatherKind } from '@/lib/town/weather-config';
import SpokenText from '@/components/town/SpokenText';
import CakeyTalk from '@/components/town/CakeyTalk';

interface CakeyOverlayProps {
  /** True while the kid can reach the submarine but has never dived — turns on
   *  Cakey's pointer to Caramel Cove. Off again the moment they have been. */
  nudgeSubmarine?: boolean;
  /** Cakey's riddles for the hidden land chests this kid has NOT opened yet
   *  (lib/town/land-chests.ts). Empty once all three are found, which hides
   *  his "hidden treasure" button. */
  treasureHints?: readonly string[];
  displayName?: string;
  /** Kid's grade for trivia calibration (0=K…6), or null to use the default. */
  kidGrade: number | null;
  /** Latest engine report of Cakey's screen anchor. Updated ~11×/sec on a ref
   *  (not state) so the follow loop never re-renders the tree. */
  infoRef: MutableRefObject<CakeyMoveInfo | null>;
  /** Whether the talk panel is open (host flips this on tap). */
  open: boolean;
  /** Close the talk panel. */
  onClose: () => void;
  /** Called with true while the panel is open so the engine freezes his wander
   *  and turns him to face the kid. */
  onPauseChange: (paused: boolean) => void;
  /** Current sky state — a change (other than the calm default) makes Cakey
   *  drop a weather line. */
  weatherKind: WeatherKind;
  /** Replay a story's mini narrative by slug (the panel's "Watch a Story again"
   *  list). The host closes the panel and starts the cutscene. */
  onPlayStory?: (slug: string) => void;
  /** Open the Cakey Garage from Cakey himself. Renting used to require standing
   *  at the garage in Town Square; Cakey wanders the whole island, so this lets
   *  a kid who is stranded far from the square still get wheels — which matters
   *  a great deal now that Race Island cannot be reached on foot. */
  onOpenGarage?: () => void;
}

export default function CakeyOverlay({
  displayName,
  kidGrade,
  infoRef,
  open,
  onClose,
  onPauseChange,
  weatherKind,
  onPlayStory,
  onOpenGarage,
  nudgeSubmarine = false,
  treasureHints = [],
}: CakeyOverlayProps): React.ReactElement {
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [ambientLine, setAmbientLine] = useState<string | null>(null);
  const ambientIdxRef = useRef(-1);
  // Read inside an interval bound once at mount, so it must be a ref or the
  // nudge would keep whatever value it had when the timer was created. Written
  // in an effect rather than during render — the compiler lint forbids touching
  // a ref while rendering, and it is right to: render can run twice.
  const nudgeSubmarineRef = useRef(nudgeSubmarine);
  useEffect(() => {
    nudgeSubmarineRef.current = nudgeSubmarine;
  }, [nudgeSubmarine]);

  // Position the bubble over the canvas each frame from the engine's ref.
  useEffect(() => {
    let raf = 0;
    const loop = (): void => {
      raf = requestAnimationFrame(loop);
      const el = bubbleRef.current;
      if (!el) return;
      const info = infoRef.current;
      // Hide when there's nothing to say, Cakey's off-screen, or the panel is
      // up (the panel carries the conversation then).
      if (!info || !info.onScreen || !ambientLine || open) {
        el.style.opacity = '0';
        return;
      }
      el.style.left = `${info.xPct * 100}%`;
      el.style.top = `${info.yPct * 100}%`;
      el.style.opacity = '1';
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [infoRef, ambientLine, open]);

  // Drop an ambient line every so often while roaming (never over the panel).
  // Picks a "notice you" line when he's close, otherwise a stroll one-liner.
  useEffect(() => {
    const speak = (): void => {
      if (open) return;
      const info = infoRef.current;
      if (!info || !info.onScreen) return;
      // Socks come up about one wander-line in five: often enough to land as a
      // running bit, rare enough that nobody starts tuning him out. A nag heard
      // every time is a nag nobody hears.
      // The submarine nudge takes the same one-in-five slot the socks bit uses,
      // and only while the host says it is still needed (cove discovered, never
      // dived). When it is off, the odds are exactly what they were before.
      const nudge = nudgeSubmarineRef.current;
      const pool =
        Math.random() < 0.2
          ? nudge
            ? SUBMARINE_LINES
            : SOCKS_AND_SHOES_LINES
          : info.nearPlayer && Math.random() < 0.6
            ? NOTICE_PLAYER_LINES
            : AMBIENT_LINES;
      const { line, index } = pickLine(pool, ambientIdxRef.current);
      ambientIdxRef.current = index;
      setAmbientLine(line);
      window.setTimeout(() => setAmbientLine((cur) => (cur === line ? null : cur)), 5200);
    };
    const first = window.setTimeout(speak, 3500); // a beat after entering
    const interval = window.setInterval(speak, 15000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [infoRef, open]);

  // Weather turned — Cakey remarks on it (skips the calm 'sunny' default so he
  // isn't chatty about clear skies). Scheduled via a timer so setState never
  // runs synchronously inside the effect body.
  useEffect(() => {
    if (weatherKind === 'sunny') return;
    const t = window.setTimeout(() => {
      const { line } = pickLine(WEATHER_LINES[weatherKind]);
      setAmbientLine(line);
      window.setTimeout(() => setAmbientLine((cur) => (cur === line ? null : cur)), 5600);
    }, 0);
    return () => window.clearTimeout(t);
  }, [weatherKind]);

  // Freeze/unfreeze his wander whenever ANY bubble is up — the tap panel OR a
  // roaming one-liner. Without the ambient half he'd "talk while power-walking
  // away"; pausing makes him stop, turn to the kid, and deliver the line, then
  // resume once it fades (~5s). External-system sync, so calling the callback
  // in the effect body is correct (no setState here).
  useEffect(() => {
    onPauseChange(open || ambientLine != null);
  }, [open, ambientLine, onPauseChange]);

  return (
    <>
      {/* Follow bubble — pinned over the canvas, offset up-left of Cakey. */}
      <div
        ref={bubbleRef}
        aria-live="polite"
        className="pointer-events-none fixed z-30 -translate-x-1/2 -translate-y-full opacity-0 transition-opacity duration-200"
        style={{ left: '50%', top: '50%' }}
      >
        {ambientLine ? (
          <div className="animate-cakey-pop relative max-w-[220px] rounded-[1.4rem] border-2 border-rose-200/80 bg-white/95 px-4 py-2.5 font-display text-sm font-semibold leading-snug text-zinc-800 shadow-lg shadow-rose-500/15 backdrop-blur-sm dark:border-zinc-600 dark:bg-zinc-800/95 dark:text-zinc-100">
            <SpokenText text={ambientLine} />
            {/* Rounded speech tail: a small square rotated 45° so its bottom
                corner points down toward Cakey; border only on the two
                down-facing edges, bg matches the card to hide the seam. */}
            <span
              className="absolute -bottom-[7px] left-6 h-3.5 w-3.5 rotate-45 rounded-[3px] border-b-2 border-r-2 border-rose-200/80 bg-white/95 backdrop-blur-sm dark:border-zinc-600 dark:bg-zinc-800/95"
              aria-hidden
            />
          </div>
        ) : null}
      </div>

      {/* Tap panel — mounted only while open (so its inner mode starts at the
          menu); its full-screen backdrop swallows canvas taps. */}
      {open ? (
        <CakeyTalk
          onClose={onClose}
          displayName={displayName}
          kidGrade={kidGrade}
          onPlayStory={onPlayStory}
          onOpenGarage={onOpenGarage}
          treasureHints={treasureHints}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// The talk panel: menu → trivia / what's new / hi.
// ---------------------------------------------------------------------------
