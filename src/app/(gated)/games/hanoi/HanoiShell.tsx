'use client';

// Cake Shift shell — GameLauncher → CakeShift3DHost → end-of-tower overlay.
//
// Same launcher → playing → gameover machine as Chess Puzzles, because the
// difficulty has the same two layers: the launcher LEVEL picks the starting
// layer count (layersForTier), and after each tower the in-session ladder
// (nextLayers) decides whether the next one is taller, the same, or shorter.
// The host reports the solve; this shell POSTs the SessionSummary and offers
// the next tower.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChromeNavButton, ChromeNavLink } from '@/components/ui/ChromeNavLink';
import { CandyButton } from '@/components/ui/CandyButton';
import { useGameBackTarget } from '@/lib/games/use-game-back-target';
import GameLauncher, { type LaunchSettings } from '@/components/games/shared/GameLauncher';
import CakeShift3DHost from '@/components/games/three/CakeShift3DHost';
import SugarTokenIcon from '@/components/wallet/SugarTokenIcon';
import { playLevelUp } from '@/lib/games/shared/sounds';
import { addGuestCoins } from '@/lib/tokens/guest-wallet';
import type { SessionSummary } from '@/lib/games/phaser/session';
import { layersForTier, minMoves, nextLayers } from '@/lib/games/hanoi/ladder';
import { buildHanoiSummary } from '@/lib/games/hanoi/summary';
import { CAKE_SHIFT_GLYPH, CAKE_SHIFT_NAME, HANOI_SLUG } from '@/lib/games/hanoi/name';

type Phase = 'playing' | 'gameover';

interface AttemptResponse {
  correct: boolean;
  currentTier: number;
  masteryPct: number;
  tieredUp: boolean;
  tieredDown: boolean;
  tokensEarned?: number;
  tokensBalance?: number | null;
  tokenReasons?: Array<'drip' | 'tier_up'>;
  guest?: boolean;
}

interface Solve {
  layers: number;
  moves: number;
  hints: number;
}

export default function HanoiShell({
  kidName,
  currentTier,
  skillSubject,
  skillSlug,
}: {
  kidName?: string;
  currentTier: number;
  skillSubject: 'math' | 'reading' | 'logic';
  skillSlug: string;
}) {
  const [settings, setSettings] = useState<LaunchSettings | null>(null);
  const [layers, setLayers] = useState(3);
  const [phase, setPhase] = useState<Phase>('playing');
  const [solve, setSolve] = useState<Solve | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [attemptResponse, setAttemptResponse] = useState<AttemptResponse | null>(null);
  const [attemptError, setAttemptError] = useState(false);
  const [roundId, setRoundId] = useState(0);
  const postedRef = useRef(false);
  // Stamped when a tower is set up (launcher Start / startTower), never at
  // render — the render-time value would be impure and is never read anyway.
  const startRef = useRef(0);

  const attemptPosting = phase === 'gameover' && summary !== null && !attemptResponse && !attemptError;

  const backOverride = useGameBackTarget();
  const backHref = backOverride?.href ?? '/town';

  const overlayTimer = useRef<number | null>(null);
  const handleComplete = useCallback(
    (r: { moves: number; hints: number }) => {
      const s = buildHanoiSummary({ n: layers, moves: r.moves, hints: r.hints, sessionStart: startRef.current });
      setSolve({ layers, moves: r.moves, hints: r.hints });
      setSummary(s);
      // Let the kid SEE the win — the spin, the fountains, the candle, Cakey's
      // line — before the card covers it. Shorter under reduced motion, where
      // the end-state is static and there is nothing to wait for.
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
      if (overlayTimer.current) window.clearTimeout(overlayTimer.current);
      overlayTimer.current = window.setTimeout(() => setPhase('gameover'), reduced ? 600 : 1600);
    },
    [layers],
  );
  useEffect(() => () => { if (overlayTimer.current) window.clearTimeout(overlayTimer.current); }, []);

  useEffect(() => {
    if (phase !== 'gameover' || !summary || !settings || postedRef.current) return;
    postedRef.current = true;
    fetch('/api/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: skillSubject,
        skillSlug,
        tier: settings.level,
        gameSlug: HANOI_SLUG,
        summary,
      }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return (await r.json()) as AttemptResponse;
      })
      .then((data) => {
        setAttemptResponse(data);
        if (data.guest && data.tokensEarned) addGuestCoins(data.tokensEarned);
        if (data.tieredUp) window.setTimeout(() => playLevelUp(), 350);
      })
      .catch((err) => {
        console.warn('[hanoi] POST /api/attempts failed:', err);
        setAttemptError(true);
      });
  }, [phase, summary, settings, skillSubject, skillSlug]);

  const startTower = useCallback((n: number) => {
    setLayers(n);
    setSolve(null);
    setSummary(null);
    setAttemptResponse(null);
    setAttemptError(false);
    postedRef.current = false;
    startRef.current = Date.now();
    setPhase('playing');
    setRoundId((r) => r + 1);
  }, []);

  // ---- Launcher ----
  if (!settings) {
    return (
      <GameLauncher
        gameTitle={CAKE_SHIFT_NAME}
        gameGlyph={CAKE_SHIFT_GLYPH}
        gameDescription="The party cake is on the wrong stand! Move it over one layer at a time — but a big layer can never sit on a little one."
        currentTier={currentTier}
        onStart={(s) => {
          startRef.current = Date.now();
          setLayers(layersForTier(s.level));
          setSettings(s);
        }}
        accentBg="bg-sky-50 dark:bg-sky-950"
        kidName={kidName}
        subject="logic"
        difficultyNoun="layers"
        backHref="/town"
        hideTypePicker
        showDuration={false}
        levelPreview={(level) => (
          <div className="text-center text-sm font-semibold text-stone-600 dark:text-stone-300">
            {CAKE_SHIFT_GLYPH} {layersForTier(level)} layers · par {minMoves(layersForTier(level))} moves
          </div>
        )}
      />
    );
  }

  const par = solve ? minMoves(solve.layers) : minMoves(layers);
  const atPar = solve ? solve.moves <= par && solve.hints === 0 : false;
  const nextN = solve ? nextLayers(solve.layers, solve.moves + solve.hints, par) : layers;

  return (
    <>
      <CakeShift3DHost
        key={`${layers}-${roundId}`}
        layers={layers}
        kidName={kidName}
        gameSlug={HANOI_SLUG}
        backHref={backHref}
        backLabel={backOverride?.label}
        onComplete={handleComplete}
      />

      {phase === 'gameover' && summary && solve ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
        >
          <div
            className="relative flex w-full max-w-md flex-col items-center gap-4 rounded-[2rem] border-4 border-white/70 p-8 text-center shadow-2xl"
            style={{ background: 'linear-gradient(135deg, #e0f2fe 0%, #fef3c7 50%, #bbf7d0 100%)' }}
          >
            <div className="text-8xl drop-shadow-lg" aria-hidden style={{ animation: 'win-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
              {atPar ? '🎂' : summary.efficiency >= 0.7 ? '🍰' : '🧁'}
            </div>
            <div className="font-display text-4xl font-bold text-zinc-900">
              {atPar ? 'Whole cake!' : summary.efficiency >= 0.7 ? 'Cake moved!' : 'Got there!'}
            </div>
            <div className="text-base font-medium text-zinc-700">
              {summary.meta_lines?.[0] ?? `${CAKE_SHIFT_GLYPH} ${solve.moves} moves · par ${par}`}
              {' · '}
              <span className="font-mono">{Math.round(summary.efficiency * 100)}%</span>
            </div>
            {summary.meta_lines?.[1] ? (
              <div className="text-sm font-semibold text-sky-800">{summary.meta_lines[1]}</div>
            ) : null}

            {attemptPosting ? (
              <div className="text-sm text-zinc-600">Saving progress…</div>
            ) : attemptResponse ? (
              attemptResponse.tieredUp ? (
                <div className="font-display rounded-full bg-amber-400 px-5 py-3 text-base font-bold text-amber-950 shadow-md">
                  ⭐ Level up! Now on level {attemptResponse.currentTier}
                </div>
              ) : (
                <div className="text-sm text-zinc-600">
                  Level {attemptResponse.currentTier} · mastery {Math.round(attemptResponse.masteryPct * 100)}%
                </div>
              )
            ) : null}

            {attemptResponse?.tokensEarned && attemptResponse.tokensEarned > 0 ? (
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
                  <span className="text-xs font-semibold uppercase tracking-wider">Bonus!</span>
                ) : null}
              </div>
            ) : null}

            <div className="mt-2 flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
              <CandyButton role="act" size="lg" block className="sm:w-auto" onClick={() => startTower(nextN)}>
                {nextN > solve.layers ? `Bake a bigger one · ${nextN} layers` : nextN < solve.layers ? `Bake a smaller one · ${nextN} layers` : `Bake another · ${nextN} layers`}
              </CandyButton>
              <ChromeNavButton onClick={() => startTower(solve.layers)} variant="dark" size="md">
                Same tower again
              </ChromeNavButton>
              <ChromeNavButton onClick={() => setSettings(null)} variant="dark" size="md">
                Change level
              </ChromeNavButton>
              <ChromeNavLink href={backHref} variant="dark" size="md">
                {backOverride?.label ?? '← Back to Map'}
              </ChromeNavLink>
            </div>
          </div>
          <style>{`@keyframes win-pop {0%{transform:scale(0.4) rotate(-20deg);opacity:0;}60%{transform:scale(1.18) rotate(8deg);opacity:1;}100%{transform:scale(1) rotate(0);opacity:1;}}@keyframes coin-land{0%{transform:translateY(-30px) scale(0.6);opacity:0;}70%{transform:translateY(4px) scale(1.08);opacity:1;}100%{transform:translateY(0) scale(1);opacity:1;}}`}</style>
        </div>
      ) : null}
    </>
  );
}
