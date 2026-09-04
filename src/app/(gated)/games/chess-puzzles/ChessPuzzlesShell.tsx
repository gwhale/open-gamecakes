'use client';

// Chess Puzzles shell — GameLauncher → ChessPuzzlesGame → game-over overlay.
//
// Pure-React game (no Phaser/Three host), so — like Word Memory — this shell
// runs the launcher → playing → gameover state machine itself, wires the header
// chrome by hand, and POSTs the SessionSummary to /api/attempts on completion.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChromeNavButton, ChromeNavLink } from '@/components/ui/ChromeNavLink';
import { resolveGameBackTarget } from '@/lib/games/back-nav';
import GameLauncher, { type LaunchSettings } from '@/components/games/shared/GameLauncher';
import GamecakesLogo from '@/components/GamecakesLogo';
import FullscreenToggle from '@/components/FullscreenToggle';
import SoundToggle from '@/components/SoundToggle';
import FeedbackButton from '@/components/games/shared/FeedbackButton';
import { useIsFullscreen } from '@/hooks/useIsFullscreen';
import { playLevelUp } from '@/lib/games/shared/sounds';
import { addGuestCoins } from '@/lib/tokens/guest-wallet';
import { SprinkleDecor } from '@/components/ui/SprinkleDecor';
import type { SessionSummary } from '@/lib/games/phaser/session';
import ChessPuzzlesGame from '@/components/games/chess-puzzles/ChessPuzzlesGame';
import SugarTokenIcon from '@/components/wallet/SugarTokenIcon';

type Phase = 'playing' | 'gameover';

interface AttemptResponse {
  correct: boolean;
  currentTier: number;
  masteryPct: number;
  tieredUp: boolean;
  tieredDown: boolean;
  // Token economy fields. Optional so guest sessions (which omit the
  // real balance) don't break the UI. See /api/attempts.
  tokensEarned?: number;
  tokensBalance?: number | null;
  tokenReasons?: Array<'drip' | 'tier_up'>;
  /** True for the guest sandbox — coins are ephemeral (banked client-side). */
  guest?: boolean;
}

// The level picks the STARTING difficulty; puzzles then ramp up automatically
// as the kid solves them without errors (see the rating ladder). The blurbs
// below describe what each starting band actually CONTAINS — matched to the
// measured library distribution (startRatingForTier → nearest puzzles):
//   T1-2 ~500-610  ≈95% mate, almost all mate-in-1
//   T3-4 ~720-830  mate-in-1/2 + first simple tactics
//   T5-6 ~940-1060 mostly 2-move tactics & mates
//   T7-8 ~1170-1280 sharper 2-3 move combinations
//   T9-10 ~1390-1500 hard 3-move combinations
function levelBlurb(level: number): string {
  if (level <= 2) return 'Mate in 1 — spot the winning move. Ramps up as you solve!';
  if (level <= 4) return 'Mate in 1–2 & simple tactics. Ramps up as you solve!';
  if (level <= 6) return '2-move tactics & mates. Ramps up as you solve!';
  if (level <= 8) return 'Sharper 2–3 move combos. Ramps up fast!';
  return 'Hard 3-move combinations. Ramps up fast!';
}

export default function ChessPuzzlesShell({
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
  const [phase, setPhase] = useState<Phase>('playing');
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [attemptResponse, setAttemptResponse] = useState<AttemptResponse | null>(null);
  const [attemptError, setAttemptError] = useState(false);
  const [roundId, setRoundId] = useState(0);
  const postedRef = useRef(false);

  const attemptPosting =
    phase === 'gameover' && summary !== null && !attemptResponse && !attemptError;

  const isFullscreen = useIsFullscreen();
  const backOverride = resolveGameBackTarget(useSearchParams().get('from'));
  const backHref = backOverride?.href ?? '/town';

  const handleComplete = useCallback((s: SessionSummary) => {
    setSummary(s);
    setPhase('gameover');
  }, []);

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
        gameSlug: 'chess-puzzles',
        summary,
        durationMin: settings.duration,
      }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return (await r.json()) as AttemptResponse;
      })
      .then((data) => {
        setAttemptResponse(data);
        // Guest sandbox has no server wallet — bank the drip locally so the
        // town coin pill still counts up this session.
        if (data.guest && data.tokensEarned) addGuestCoins(data.tokensEarned);
        if (data.tieredUp) window.setTimeout(() => playLevelUp(), 350);
      })
      .catch((err) => {
        console.warn('[chess-puzzles] POST /api/attempts failed:', err);
        setAttemptError(true);
      });
  }, [phase, summary, settings, skillSubject, skillSlug]);

  const resetForNewRound = useCallback(() => {
    setSummary(null);
    setAttemptResponse(null);
    setAttemptError(false);
    postedRef.current = false;
    setPhase('playing');
    setRoundId((r) => r + 1);
  }, []);

  // ---- Launcher ----
  if (!settings) {
    return (
      <GameLauncher
        gameTitle="Chess Puzzles"
        gameGlyph="♟️"
        gameDescription="Beat the clock — solve as many puzzles as you can in 3 minutes!"
        currentTier={currentTier}
        onStart={setSettings}
        accentBg="bg-rose-50 dark:bg-stone-900"
        kidName={kidName}
        subject="logic"
        difficultyNoun="puzzles"
        backHref="/town"
        hideTypePicker
        levelPreview={(level) => (
          <div className="text-center text-sm font-semibold text-stone-600 dark:text-stone-300">
            ♟️ {levelBlurb(level)}
          </div>
        )}
      />
    );
  }

  // ---- Playing / game-over ----
  return (
    <main
      className={
        isFullscreen
          ? 'relative flex h-screen flex-col items-stretch overflow-hidden overscroll-none select-none'
          : 'relative flex flex-1 flex-col items-center overflow-hidden overscroll-none p-4 select-none sm:p-6'
      }
      style={{ background: 'linear-gradient(160deg, #fff1f2 0%, #fef3c7 48%, #dcfce7 100%)' }}
    >
      <SprinkleDecor density="scatter" style={{ zIndex: 0 }} />

      {/* Cakey theming — faint oversized desserts behind the board (ticket:
          "make background more cakey themed"). Very low opacity so they never
          compete with the pieces. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 select-none overflow-hidden">
        <span className="absolute left-[4%] top-[12%] text-6xl opacity-[0.08] sm:text-7xl">🎂</span>
        <span className="absolute right-[5%] top-[18%] text-5xl opacity-[0.08] sm:text-6xl">🧁</span>
        <span className="absolute bottom-[10%] left-[8%] text-5xl opacity-[0.08] sm:text-6xl">🍪</span>
        <span className="absolute bottom-[14%] right-[6%] text-6xl opacity-[0.08] sm:text-7xl">🍩</span>
      </div>

      {isFullscreen ? (
        <div className="absolute right-3 top-3 z-40 flex items-center gap-2">
          <SoundToggle size="sm" />
          <FullscreenToggle size="sm" />
          {/* Exit is otherwise unreachable in fullscreen (ticket ask). */}
          <ChromeNavLink href={backHref} variant="dark" size="sm">✕ Exit</ChromeNavLink>
        </div>
      ) : (
        <header className="relative z-10 flex w-full max-w-lg items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <GamecakesLogo size={40} />
            <div>
              <div className="text-xs uppercase tracking-wider text-rose-500">Chess Puzzles</div>
              <h1 className="text-2xl font-bold text-stone-800">
                {kidName ? `${kidName}'s Chess Island` : 'Chess Island'}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <FeedbackButton gameSlug="chess-puzzles" kidName={kidName} />
            <SoundToggle size="sm" />
            <FullscreenToggle size="sm" />
            <ChromeNavLink href={backHref} variant="dark" size="sm">✕ Exit</ChromeNavLink>
          </div>
        </header>
      )}

      <div className="relative z-10 mt-4 flex w-full flex-1 items-center justify-center">
        <div className="w-full max-w-[560px] rounded-[2rem] border-4 border-white/80 bg-white/80 p-3 shadow-[0_12px_45px_rgba(244,114,182,0.28)] backdrop-blur-sm sm:p-4">
          <ChessPuzzlesGame key={`${settings.level}-${roundId}`} level={settings.level} onComplete={handleComplete} />
        </div>
      </div>

      {!isFullscreen ? (
        <div className="relative z-10 mt-6 flex gap-3">
          <Link
            href={backHref}
            className="rounded-full border border-rose-300 bg-white/80 px-4 py-2 text-sm font-medium text-stone-700 shadow-sm hover:bg-white active:scale-95"
            style={{ minHeight: 'var(--min-tap-target)' }}
          >
            {backOverride?.label ?? '← Back to Map'}
          </Link>
        </div>
      ) : null}

      {/* ---- Game-over overlay ---- */}
      {phase === 'gameover' && summary ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div
            className="flex w-full max-w-md flex-col items-center gap-4 rounded-3xl p-8 text-center shadow-2xl"
            style={{ background: 'linear-gradient(135deg, #fecdd3, #fef3c7, #bbf7d0)' }}
          >
            <div className="text-7xl animate-bounce" aria-hidden>
              {summary.efficiency >= 0.9 ? '🏆' : summary.efficiency >= 0.6 ? '♟️' : '🙂'}
            </div>
            <div className="text-3xl font-bold text-zinc-900">
              {summary.efficiency >= 0.9
                ? 'Grandmaster!'
                : summary.efficiency >= 0.6
                  ? 'Nice moves!'
                  : 'Good try!'}
            </div>
            <div className="text-base text-zinc-700">
              {summary.meta_lines?.[0] ?? `${summary.optimal_taps} puzzles`}
              {' · '}
              <span className="font-mono">{Math.round(summary.efficiency * 100)}%</span>
            </div>
            {summary.meta_lines?.[1] ? (
              <div className="text-sm font-semibold text-violet-700">{summary.meta_lines[1]}</div>
            ) : null}

            {attemptPosting ? (
              <div className="text-sm text-zinc-600">Saving progress…</div>
            ) : attemptResponse ? (
              attemptResponse.tieredUp ? (
                <div className="rounded-full bg-amber-400 px-5 py-3 text-base font-bold text-amber-950">
                  ⭐ Level up! Now on level {attemptResponse.currentTier}
                </div>
              ) : (
                <div className="text-sm text-zinc-600">
                  Level {attemptResponse.currentTier} · mastery{' '}
                  {Math.round(attemptResponse.masteryPct * 100)}%
                </div>
              )
            ) : null}

            {/* Token reward — the coin lands with a scale-in so the kid
                sees it arrive. Drips 🪙 for finishing, +5 on a level-up. */}
            {attemptResponse?.tokensEarned && attemptResponse.tokensEarned > 0 ? (
              <div
                className={`flex items-center gap-2 rounded-full border-2 px-5 py-2.5 font-bold shadow-md ${
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

            <div className="mt-2 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={resetForNewRound}
                className="rounded-full px-6 py-4 text-lg font-semibold text-white shadow-md active:scale-95"
                style={{
                  background:
                    'linear-gradient(to right, var(--brand-strawberry, #fb7185), var(--brand-strawberry-deep, #e11d48))',
                  minHeight: 'var(--min-tap-target)',
                }}
              >
                Play Again
              </button>
              <ChromeNavButton
                onClick={() => setSettings(null)}
                variant="dark"
                size="md"
              >
                Change level
              </ChromeNavButton>
              <ChromeNavLink href={backHref} variant="dark" size="lg">
                {backOverride?.label ?? '← Back to Map'}
              </ChromeNavLink>
            </div>
          </div>
          <style>{`
            @keyframes coin-land {
              0%   { transform: translateY(-30px) scale(0.6); opacity: 0; }
              60%  { transform: translateY(4px)   scale(1.08); opacity: 1; }
              100% { transform: translateY(0)     scale(1);    opacity: 1; }
            }
          `}</style>
        </div>
      ) : null}
    </main>
  );
}
