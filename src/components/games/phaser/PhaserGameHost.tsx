'use client';

// PhaserGameHost — shared React wrapper for Phaser 3 games.
//
// Responsibilities (so no scene has to repeat them):
//   1. Mount a `Phaser.Game` inside a ref'd div with dynamic import so
//      Next.js SSR never tries to render canvas/webgl on the server.
//   2. React strict-mode safe: guards against double-create via a
//      `createdRef`; destroys the game on unmount.
//   3. Listens for scene events ('challenge:open', 'session:end',
//      'scene:sfx') on a shared Phaser.Events.EventEmitter we inject
//      into each scene's data registry under the key 'hostBus'.
//   4. Renders the challenge modal in React (using the same pad UI
//      pattern as the existing SVG games) so kids see a consistent
//      input experience across every game.
//   5. POSTs session summaries to /api/attempts, renders the game-over
//      overlay, and exposes a "Play Again" flow via 'scene:reset'.
//
// Scenes receive `{ sceneProps, hostBus }` via registry so they stay
// stateless relative to React — the host passes data in, scenes emit
// events out.

import { ChromeNavLink } from '@/components/ui/ChromeNavLink';
import { CandyButton } from '@/components/ui/CandyButton';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { resolveGameBackTarget } from '@/lib/games/back-nav';
import type { Types as PhaserTypes } from 'phaser';
import FullscreenToggle from '@/components/FullscreenToggle';
import SoundToggle from '@/components/SoundToggle';
import { useIsFullscreen } from '@/hooks/useIsFullscreen';
import FeedbackButton from '@/components/games/shared/FeedbackButton';
import ChallengeInput from '@/components/games/shared/ChallengeInput';
import GamecakesLogo from '@/components/GamecakesLogo';
import {
  playBubble,
  playCatch,
  playCorrect,
  playEscape,
  playHop,
  playLevelUp,
  playPadPress,
  playStart,
  playSwoop,
  playTap,
  playTick,
  playTimeUp,
  playWin,
  playWrong,
} from '@/lib/games/shared/sounds';
import { addGuestCoins } from '@/lib/tokens/guest-wallet';
import { getSessionDuration } from '@/lib/games/session-duration';
import { hapticTap, hapticThump, hapticSuccess, hapticWrong } from '@/lib/haptics';
import type { Challenge } from '@/lib/games/shared/challenge';
import type { SessionSummary, SoundName } from '@/lib/games/phaser/session';
import SugarTokenIcon from '@/components/wallet/SugarTokenIcon';

// Sound name → helper dispatcher. Matches the SoundName union in session.ts.
const SFX: Record<SoundName, () => void> = {
  tap: playTap,
  catch: playCatch,
  escape: playEscape,
  hop: playHop,
  tick: playTick,
  padPress: playPadPress,
  timeUp: playTimeUp,
  win: playWin,
  correct: playCorrect,
  wrong: playWrong,
  bubble: playBubble,
  swoop: playSwoop,
  levelUp: playLevelUp,
  start: playStart,
};

/** Sound name → matching haptic vibration. Played alongside the audio
 *  dispatcher so every scene gets haptics for free without per-scene
 *  wiring. Only the satisfying / informative sounds get a haptic;
 *  ambient ticks and bubbles stay silent so the iPad doesn't buzz
 *  constantly during a 3-minute round. */
const HAPTICS: Partial<Record<SoundName, () => void>> = {
  catch: hapticThump,
  win: hapticSuccess,
  correct: hapticThump,
  wrong: hapticWrong,
  levelUp: hapticSuccess,
  padPress: hapticTap,
};

/** A Phaser Scene class (constructor). */
type PhaserSceneClass = new (...args: unknown[]) => Phaser.Scene;

export interface PhaserSceneFactory {
  /** Scene key Phaser uses to identify the scene. Unique per game. */
  key: string;
  /**
   * Return a Phaser.Scene subclass (not instance). Called once at mount.
   * May be sync OR async — async lets the factory live in a Phaser-free
   * module and defer the scene class (which statically imports Phaser)
   * until we're safely client-side, avoiding a `window is not defined`
   * crash during Turbopack dev-mode server evaluation.
   */
  create: () => PhaserSceneClass | Promise<PhaserSceneClass>;
}

export interface PhaserGameHostProps {
  /** Chrome shown above the canvas (title, kid name, etc). */
  title: string;
  subtitle?: string;
  kidName?: string;
  /** Game slug used by FeedbackButton and /api/attempts default. */
  gameSlug: string;
  /** Scene factory — which game to mount. */
  sceneFactory: PhaserSceneFactory;
  /** Props passed into the scene via `data.get('sceneProps')`. */
  sceneProps: Record<string, unknown>;
  /** Canvas dimensions in game units. Scene controls its own aspect;
   *  the host handles fit-to-container scaling. */
  width: number;
  height: number;
  /** /api/attempts POST body metadata. Omit for anonymous play (e.g. the
   *  /ba arcade): no session summary is posted, and the FeedbackButton is
   *  hidden too since the feedback API also needs a family session. */
  attemptMeta?: {
    subject: 'math' | 'reading';
    skillSlug: string;
    tier: number;
    gameSlug: string;
  };
  /** Where the Map / Back home links point. Defaults to /town; anonymous
   *  shells override (e.g. /ba). */
  backHref?: string;
  /** Label for the back links. Defaults to the map wording ('← Map' in
   *  fullscreen, '← Back to Map' below the canvas); contexts with no map
   *  (e.g. /ba) override to '← Back to menu'. */
  backLabel?: string;
  /** Run the host-owned session clock (draining bar + scene:timeUp at zero).
   *  OFF by default: most scenes own their own GAME_DURATION_MS timer + badge,
   *  which we parameterize by the chosen length directly. Turn this ON only
   *  for a scene that has NO timer of its own (e.g. Sharks & Minnows), so the
   *  host provides the time cap without a second clock fighting the scene's. */
  hostTimer?: boolean;
}

interface AttemptResponse {
  correct: boolean;
  currentTier: number;
  masteryPct: number;
  tieredUp: boolean;
  tieredDown: boolean;
  // Token economy fields. Optional so older API deploys (or guest
  // sessions, see /api/attempts) that omit them don't break the UI.
  tokensEarned?: number;
  tokensBalance?: number | null;
  tokenReasons?: Array<'drip' | 'tier_up'>;
  /** True for the guest sandbox — coins are ephemeral (banked client-side). */
  guest?: boolean;
}

type Phase = 'playing' | 'challenge' | 'gameover';

export default function PhaserGameHost(props: PhaserGameHostProps) {
  // When the kid came from the All Games menu (/games?from=…), every back
  // surface below (fullscreen pill, below-canvas pill, game-over modal)
  // returns them there instead of /town. Null override → caller defaults.
  const backOverride = resolveGameBackTarget(useSearchParams().get('from'));
  const backHref = backOverride?.href ?? props.backHref ?? '/town';
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const busRef = useRef<Phaser.Events.EventEmitter | null>(null);
  const createdRef = useRef(false);

  // When the browser enters fullscreen, we collapse the page chrome and
  // let the canvas container grow to fill the viewport. Phaser.Scale.FIT
  // rescales the canvas inside — but we need to poke the scale manager
  // after React's DOM reflow settles, otherwise the canvas is still
  // sized to the pre-fullscreen container bounds.
  const isFullscreen = useIsFullscreen();
  useEffect(() => {
    const g = gameRef.current;
    if (!g) return;
    // Let React paint the new layout first, then refresh Phaser's
    // understanding of its parent bounds.
    const t = window.setTimeout(() => g.scale.refresh(), 120);
    return () => window.clearTimeout(t);
  }, [isFullscreen]);

  const [phase, setPhase] = useState<Phase>('playing');
  const [challenge, setChallenge] = useState<{
    challenge: Challenge;
    reason: string;
  } | null>(null);
  const [flashWrong, setFlashWrong] = useState(false);

  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [attemptResponse, setAttemptResponse] = useState<AttemptResponse | null>(null);
  const [attemptPosting, setAttemptPosting] = useState(false);
  const postedRef = useRef(false);

  // ---- Session clock (time cap) ----
  // The kid picked 1/2/3 min on the launcher; the round ends when this hits
  // zero OR when the scene ends on its own (out of lives / cleared board),
  // whichever comes first. The clock only ticks during active play — it
  // pauses under the challenge modal (the scene is paused too) so solving
  // math never eats the timer. On zero we signal the scene via the bus and
  // it builds the summary from the current score.
  const [durationMin] = useState(() => getSessionDuration());
  const [secondsLeft, setSecondsLeft] = useState(() => durationMin * 60);
  const timeUpFiredRef = useRef(false);

  useEffect(() => {
    if (!props.hostTimer || phase !== 'playing' || secondsLeft <= 0) return;
    const t = window.setTimeout(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [props.hostTimer, phase, secondsLeft]);

  useEffect(() => {
    if (!props.hostTimer) return;
    if (secondsLeft === 0 && !timeUpFiredRef.current) {
      timeUpFiredRef.current = true;
      busRef.current?.emit('scene:timeUp', {});
    }
  }, [props.hostTimer, secondsLeft]);

  // ---- iPad touch-lock ----
  // Lock the page chrome for the lifetime of the Phaser game so a finger
  // drag on the canvas can't rubber-band the page underneath. CSS rules
  // alone aren't enough on iOS Safari — sustained drags still translate
  // to URL-bar collapse / page pan unless touchmove itself is canceled
  // with a non-passive listener. The handler skips inputs/buttons/dialogs
  // so the math modal pad and feedback overlay still scroll/tap normally.
  // Hoisted here (from the since-removed Water Balloons shell) so every Phaser game gets it
  // for free — drag-aim, joystick, tilt, and tap games are all immune.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      htmlTouchAction: html.style.touchAction,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyTouchAction: body.style.touchAction,
      bodyOverscroll: body.style.overscrollBehavior,
      bodyPosition: body.style.position,
      bodyWidth: body.style.width,
      bodyHeight: body.style.height,
    };
    html.style.overflow = 'hidden';
    html.style.touchAction = 'none';
    html.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden';
    body.style.touchAction = 'none';
    body.style.overscrollBehavior = 'none';
    body.style.position = 'fixed';
    body.style.width = '100%';
    body.style.height = '100%';

    const blockTouchMove = (e: TouchEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('button, input, [role="dialog"]')) return;
      e.preventDefault();
    };
    document.addEventListener('touchmove', blockTouchMove, { passive: false });

    return () => {
      document.removeEventListener('touchmove', blockTouchMove);
      html.style.overflow = prev.htmlOverflow;
      html.style.touchAction = prev.htmlTouchAction;
      html.style.overscrollBehavior = prev.htmlOverscroll;
      body.style.overflow = prev.bodyOverflow;
      body.style.touchAction = prev.bodyTouchAction;
      body.style.overscrollBehavior = prev.bodyOverscroll;
      body.style.position = prev.bodyPosition;
      body.style.width = prev.bodyWidth;
      body.style.height = prev.bodyHeight;
    };
  }, []);

  // ---- Mount Phaser game (client only, dynamic import) ----
  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;

    let destroyed = false;

    (async () => {
      // Phaser ESM has no default export — use the full namespace.
      const Phaser = await import('phaser');

      if (destroyed || !containerRef.current) return;

      // Shared bus for Phaser → React communication. Phaser's own
      // EventEmitter implements the same API as the browser's.
      const bus = new Phaser.Events.EventEmitter();
      busRef.current = bus;

      // Forward scene events to React state.
      bus.on('challenge:open', (payload: { challenge: Challenge; reason: string }) => {
        setChallenge(payload);
        setPhase('challenge');
      });
      bus.on('session:end', (payload: { summary: SessionSummary }) => {
        setSessionSummary(payload.summary);
        setPhase('gameover');
      });
      bus.on('scene:sfx', (payload: { name: SoundName }) => {
        SFX[payload.name]?.();
        HAPTICS[payload.name]?.();
      });

      // `await` works for both sync and async factories — Promise.resolve
      // on a non-Promise just hands back the value. Older factories returning
      // the class directly keep working; new factories can async-import the
      // scene file (which statically imports Phaser) to keep the scene
      // module out of the server bundle.
      const SceneClass = await props.sceneFactory.create();
      if (destroyed) return;

      const config: PhaserTypes.Core.GameConfig = {
        type: Phaser.AUTO,
        parent: containerRef.current,
        width: props.width,
        height: props.height,
        backgroundColor: '#bae6fd',
        physics: {
          default: 'arcade',
          arcade: {
            gravity: { x: 0, y: 900 },
            debug: false,
          },
        },
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        scene: SceneClass,
        // Keyboard stays enabled at the Phaser level for space/arrow flapping;
        // React modal uses window.addEventListener so keydown still reaches
        // both paths. Scene gates its own handlers on `this.paused` so the
        // bird doesn't flap while the challenge modal is up.
        audio: {
          // Let our React-side sounds.ts own the AudioContext.
          // Phaser scenes emit 'scene:sfx' and the host dispatches.
          disableWebAudio: true,
        },
      };

      const game = new Phaser.Game(config);
      gameRef.current = game;

      // Inject props + bus into the scene's data registry so scenes
      // don't need scene-specific constructor signatures.
      game.registry.set('sceneProps', props.sceneProps);
      game.registry.set('hostBus', bus);
    })();

    return () => {
      destroyed = true;
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
      if (busRef.current) {
        busRef.current.removeAllListeners();
        busRef.current = null;
      }
      createdRef.current = false;
    };
    // Mount once per component lifecycle. Scene factory + props are
    // captured at mount; to change scene the parent must remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Challenge result handler ----
  /** Ends the modal and emits challenge:result. `correct` is decided by
   *  ChallengeInput (numeric submit OR choice tap); this is just the cleanup
   *  + wrong-answer flash the scene sees via the event. */
  const finishChallenge = useCallback((correct: boolean) => {
    if (!correct) {
      setFlashWrong(true);
      setTimeout(() => setFlashWrong(false), 350);
    }
    setChallenge(null);
    setPhase('playing');
    busRef.current?.emit('challenge:result', { correct });
  }, []);

  // ---- POST session summary on game over ----
  useEffect(() => {
    if (phase !== 'gameover' || !sessionSummary || postedRef.current) return;
    postedRef.current = true;
    // Anonymous play (no attemptMeta) — nothing to save, overlay shows
    // the session stats without the tier/coin readout.
    if (!props.attemptMeta) return;
    const meta = props.attemptMeta;
    setAttemptPosting(true);

    fetch('/api/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: meta.subject,
        skillSlug: meta.skillSlug,
        tier: meta.tier,
        gameSlug: meta.gameSlug,
        summary: sessionSummary,
        durationMin,
      }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return (await res.json()) as AttemptResponse;
      })
      .then((data) => {
        setAttemptResponse(data);
        if (data.guest && data.tokensEarned) addGuestCoins(data.tokensEarned);
        // Play the tier-up fanfare once the server confirms the jump.
        // Offset a beat after the scene's own 'win'/'timeUp' so they don't
        // step on each other.
        if (data.tieredUp) {
          window.setTimeout(() => playLevelUp(), 350);
        }
      })
      .catch((err) => console.warn('[phaser-host] POST failed:', err))
      .finally(() => setAttemptPosting(false));
  }, [phase, sessionSummary, props.attemptMeta, durationMin]);

  // ---- Reset hands control back to the scene ----
  const handleReset = useCallback(() => {
    setPhase('playing');
    setSessionSummary(null);
    setAttemptResponse(null);
    postedRef.current = false;
    // Restart the session clock for the new round.
    timeUpFiredRef.current = false;
    setSecondsLeft(durationMin * 60);
    busRef.current?.emit('scene:reset', {});
  }, [durationMin]);

  // ---- Render ----
  return (
    <main
      // `select-none` + `overscroll-none` close the last "webby" seams:
      //   - kids dragging across the canvas edge won't highlight the header
      //   - a flick on the canvas won't rubber-band the outer page
      // `touch-action: manipulation` (from globals.css) still lets modals
      // scroll internally when the answer pad exceeds their height.
      className={
        isFullscreen
          ? 'flex h-screen flex-col items-stretch overscroll-none bg-sky-100 select-none dark:bg-zinc-950'
          : 'flex flex-1 flex-col items-center overscroll-none p-4 select-none sm:p-6'
      }
    >
      {/* Page header — hidden in fullscreen so the canvas gets max pixels.
          The toggle cluster renders separately in fullscreen (floating
          top-right) so kids can still exit fullscreen, mute audio, OR
          bail back to the map. The Map link matters most in PWA
          standalone mode where the Fullscreen toggle is a no-op (iOS
          doesn't expose a way to leave standalone display-mode), so
          without an explicit Map exit the kid was trapped inside the
          game until the round timed out. */}
      {isFullscreen ? (
        <div className="absolute right-3 top-3 z-40 flex items-center gap-2">
          <ChromeNavLink href={backHref} variant="dark" size="sm" ariaLabel="Leave game">
            {backOverride?.label ?? props.backLabel ?? '← Map'}
          </ChromeNavLink>
          <SoundToggle size="sm" />
          <FullscreenToggle size="sm" />
        </div>
      ) : (
        <header className="flex w-full max-w-lg items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <GamecakesLogo size={40} />
            <div>
              <div className="text-xs uppercase tracking-wider text-zinc-500">
                {props.title}
              </div>
              {props.subtitle ? (
                <h1 className="text-2xl font-bold">{props.subtitle}</h1>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Feedback files into the family-scoped ticket API — hide it
                for anonymous (no-attemptMeta) sessions where it would 401. */}
            {props.attemptMeta ? (
              <FeedbackButton gameSlug={props.gameSlug} kidName={props.kidName} />
            ) : null}
            <SoundToggle size="sm" />
            <FullscreenToggle size="sm" />
          </div>
        </header>
      )}

      {/* Canvas container. Normal mode: aspect-ratio card, max-w-lg.
          Fullscreen: flex-1 so it fills whatever vertical space is left.
          Phaser.Scale.FIT auto-rescales the canvas either way. The Phaser
          canvas mounts into the absolute inner div so the session-clock bar
          can overlay the top edge (same structure as the 3D hosts). */}
      <div
        className={
          isFullscreen
            ? 'relative w-full flex-1 overflow-hidden bg-sky-100'
            : 'relative mt-3 w-full max-w-lg overflow-hidden rounded-3xl bg-sky-100 shadow-xl'
        }
        style={isFullscreen ? undefined : { aspectRatio: `${props.width} / ${props.height}` }}
        aria-label={`${props.title} game area`}
      >
        <div ref={containerRef} className="absolute inset-0" style={{ touchAction: 'none' }} />
        {/* Host session clock — only for scenes without their own timer. */}
        {props.hostTimer ? (
          <SessionClockBar secondsLeft={secondsLeft} totalSeconds={durationMin * 60} durationMin={durationMin} />
        ) : null}
      </div>

      {/* Back-to-Map — hidden in fullscreen to maximize canvas real estate.
          Dark translucent pill matches the floating chrome (sound,
          fullscreen, feedback) so navigation reads as one cluster. */}
      {isFullscreen ? null : (
        <div className="mt-4 flex gap-3">
          <ChromeNavLink href={backHref} variant="dark" size="md">
            {backOverride?.label ?? props.backLabel ?? '← Back to Map'}
          </ChromeNavLink>
        </div>
      )}

      {/* ---- Challenge modal (shared across Phaser games) ---- */}
      {phase === 'challenge' && challenge ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Challenge: ${challenge.challenge.prompt}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
            <div className="text-center text-sm uppercase tracking-wider text-zinc-500">
              {challenge.reason}
            </div>

            <ChallengeInput
              challenge={challenge.challenge}
              flashWrong={flashWrong}
              onAnswer={finishChallenge}
            />
          </div>
        </div>
      ) : null}

      {/* ---- End-of-round modal — May 2026 redesign ----
           Bigger, candy-bright, hero emoji popping over the gradient
           card, +coin badge animates on land (CSS keyframe). The win
           feedback is the highest-leverage moment of any game; it
           gets the most-polished UI. */}
      {phase === 'gameover' && sessionSummary ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
        >
          <div
            className="relative flex w-full max-w-md flex-col items-center gap-5 rounded-[2rem] border-4 border-white/70 p-8 text-center shadow-2xl"
            style={{ background: 'linear-gradient(135deg, #fecdd3 0%, #fef3c7 50%, #bbf7d0 100%)' }}
          >
            {/* Hero emoji — pops with a wobble, big enough to feel like
                a trophy lift. Cakey 🎂 for top tier; star + cake-pop
                emoji for mid/low. */}
            <div
              className="text-8xl drop-shadow-lg"
              aria-hidden
              style={{
                animation: 'win-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
            >
              {sessionSummary.efficiency >= 0.8 ? '🎂' : sessionSummary.efficiency >= 0.5 ? '⭐' : '🧁'}
            </div>
            <div className="font-display text-4xl font-bold text-zinc-900">
              {sessionSummary.efficiency >= 0.8
                ? 'Amazing!'
                : sessionSummary.efficiency >= 0.5
                  ? 'Good run!'
                  : 'Nice try!'}
            </div>
            <div className="text-base font-medium text-zinc-700">
              <span className="font-mono font-bold">{sessionSummary.optimal_taps}</span> right
              {' · '}
              <span className="font-mono">{Math.round(sessionSummary.efficiency * 100)}%</span>
            </div>

            {/* Game-specific summary lines (e.g. "🎈 12 hits" for Water
                Balloons). Games without per-game stats omit meta_lines. */}
            {sessionSummary.meta_lines && sessionSummary.meta_lines.length > 0 ? (
              <div className="flex flex-col items-center gap-1 text-sm text-zinc-700">
                {sessionSummary.meta_lines.map((line, i) => (
                  <div key={i} className="font-medium">{line}</div>
                ))}
              </div>
            ) : null}

            {attemptPosting ? (
              <div className="text-sm text-zinc-600">Saving your run…</div>
            ) : attemptResponse ? (
              <div className="flex flex-col items-center gap-2">
                {attemptResponse.tieredUp ? (
                  <div className="font-display rounded-full bg-amber-400 px-5 py-3 text-base font-bold text-amber-950 shadow-md">
                    ⭐ Level up! Tier {attemptResponse.currentTier}
                  </div>
                ) : (
                  <div className="text-xs text-zinc-600">
                    Tier {attemptResponse.currentTier} · mastery{' '}
                    {Math.round(attemptResponse.masteryPct * 100)}%
                  </div>
                )}
                {/* Token mint readout — coin lands with a quick scale-in
                    animation so the kid sees the reward arrive. */}
                {attemptResponse.tokensEarned && attemptResponse.tokensEarned > 0 ? (
                  <div
                    className={`font-display flex items-center gap-2 rounded-full border-2 px-5 py-2.5 font-bold shadow-md ${
                      attemptResponse.tokenReasons?.includes('tier_up')
                        ? 'border-amber-500 bg-amber-200 text-amber-900 text-lg'
                        : 'border-amber-400 bg-amber-100 text-amber-800 text-base'
                    }`}
                    aria-live="polite"
                    style={{ animation: 'coin-land 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                  >
                    <SugarTokenIcon size="1.3em" className="shrink-0" />
                    <span className="font-mono tabular-nums">+{attemptResponse.tokensEarned}</span>
                    {attemptResponse.tokenReasons?.includes('tier_up') ? (
                      <span className="text-xs font-semibold uppercase tracking-wider">
                        Bonus!
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-2 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
              <CandyButton
                role="act"
                size="lg"
                block
                className="sm:w-auto"
                onClick={handleReset}
              >
                Play again!
              </CandyButton>
              <ChromeNavLink href={backHref} variant="dark" size="lg">
                {backOverride?.label ?? props.backLabel ?? '← Back home'}
              </ChromeNavLink>
            </div>
          </div>
          <style>{`
            @keyframes win-pop {
              0%   { transform: scale(0.4) rotate(-20deg); opacity: 0; }
              60%  { transform: scale(1.18) rotate(8deg);  opacity: 1; }
              100% { transform: scale(1.0)  rotate(0deg);  opacity: 1; }
            }
            @keyframes coin-land {
              0%   { transform: translateY(-30px) scale(0.6); opacity: 0; }
              70%  { transform: translateY(4px)   scale(1.08); opacity: 1; }
              100% { transform: translateY(0)     scale(1.0);  opacity: 1; }
            }
          `}</style>
        </div>
      ) : null}
    </main>
  );
}

// ---- Pad button (same styling as the SVG games' modal) ----
// ---- Session-clock overlay (time cap) ----
// A thin draining bar pinned to the top of the canvas + a m:ss readout and a
// "🪙×N" reminder of the cookie multiplier the chosen length is worth. Turns
// red under 15s. pointer-events-none so it never eats a tap on the canvas.
function SessionClockBar({
  secondsLeft,
  totalSeconds,
  durationMin,
}: {
  secondsLeft: number;
  totalSeconds: number;
  durationMin: number;
}) {
  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const pct = Math.max(0, Math.min(100, (secondsLeft / totalSeconds) * 100));
  const low = secondsLeft <= 15;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-2">
      <div className="flex items-center justify-between px-1 text-xs font-bold tabular-nums text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">
        <span>
          ⏱ {mm}:{ss}
        </span>
        <span className="inline-flex items-center gap-0.5"><SugarTokenIcon size="1em" />×{durationMin}</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-black/25">
        <div
          className="h-full rounded-full transition-[width] duration-1000 ease-linear"
          style={{
            width: `${pct}%`,
            background: low
              ? 'linear-gradient(to right, #fb7185, #e11d48)'
              : 'linear-gradient(to right, #fde68a, #34d399)',
          }}
        />
      </div>
    </div>
  );
}
