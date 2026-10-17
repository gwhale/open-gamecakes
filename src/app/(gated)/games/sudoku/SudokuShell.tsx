'use client';

// Waffle Sudoku shell — GameLauncher → SudokuGame → round-over overlay.
//
// Pure-React game (no Phaser/Three host), so — like Chess Puzzles and Cakey
// Checkers — this shell runs the launcher → playing → gameover state machine
// itself, wires the header chrome by hand, and POSTs the SessionSummary to
// /api/attempts on completion.
//
// ONE PUZZLE PER ROUND, NO CLOCK. showDuration={false} for the reason Checkers
// gives: a clock that hands a kid a loss on time is punishing and off-brand,
// and a sudoku under a clock teaches guessing. Instead the ladder moves per
// round: a clean solve (no slips, no hints) steps the running `score` up on
// "Next puzzle", anything else eases it down. The launcher level only picks
// where the score STARTS (startScoreForTier); "Change level" resets it.
//
// The seed for each round is picked here and handed to the game, which
// dev-logs it alongside what it generated — so "the waffle had two answers"
// is a reproducible report, never a shrug.

import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChromeNavButton, ChromeNavLink } from '@/components/ui/ChromeNavLink';
import { CandyButton } from '@/components/ui/CandyButton';
import { useGameBackTarget } from '@/lib/games/use-game-back-target';
import GameLauncher, { type LaunchSettings } from '@/components/games/shared/GameLauncher';
import GamecakesLogo from '@/components/GamecakesLogo';
import FullscreenToggle from '@/components/FullscreenToggle';
import SoundToggle from '@/components/SoundToggle';
import FeedbackButton from '@/components/games/shared/FeedbackButton';
import { useIsFullscreen } from '@/hooks/useIsFullscreen';
import { playLevelUp } from '@/lib/games/shared/sounds';
import { addGuestCoins } from '@/lib/tokens/guest-wallet';
import { SprinkleDecor } from '@/components/ui/SprinkleDecor';
import SugarTokenIcon from '@/components/wallet/SugarTokenIcon';
import type { SessionSummary } from '@/lib/games/phaser/session';
import SudokuGame from '@/components/games/sudoku/SudokuGame';
import { bandForTier, specForScore, startScoreForTier, stepScore } from '@/lib/games/sudoku/ladder';

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

/** UI-side randomness only — the generator itself is seeded by this. */
function freshSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

export default function SudokuShell({
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
  const [score, setScore] = useState(0);
  const [seed, setSeed] = useState(0);
  const [lastClean, setLastClean] = useState(false);
  const postedRef = useRef(false);

  // Memoised on the score: the game re-bakes when this object changes.
  const spec = useMemo(() => specForScore(score), [score]);

  const attemptPosting = phase === 'gameover' && summary !== null && !attemptResponse && !attemptError;

  const isFullscreen = useIsFullscreen();
  const backOverride = useGameBackTarget();
  const backHref = backOverride?.href ?? '/town';

  const handleComplete = useCallback((s: SessionSummary, outcome: { clean: boolean }) => {
    setSummary(s);
    setLastClean(outcome.clean);
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
        gameSlug: 'sudoku',
        summary,
        // Undefined — the game is untimed. computeSessionDrip has a default.
        durationMin: settings.duration,
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
        console.warn('[sudoku] POST /api/attempts failed:', err);
        setAttemptError(true);
      });
  }, [phase, summary, settings, skillSubject, skillSlug]);

  const beginRound = useCallback(() => {
    setSummary(null);
    setAttemptResponse(null);
    setAttemptError(false);
    postedRef.current = false;
    setSeed(freshSeed());
    setPhase('playing');
    setRoundId((r) => r + 1);
  }, []);

  const onStart = useCallback((s: LaunchSettings) => {
    setSettings(s);
    setScore(startScoreForTier(s.level));
    setSeed(freshSeed());
    setLastClean(false);
  }, []);

  /** Clean solve → the ladder steps up; otherwise it eases down. */
  const nextPuzzle = useCallback(() => {
    setScore((s) => stepScore(s, lastClean));
    beginRound();
  }, [lastClean, beginRound]);

  // ---- Launcher ----
  if (!settings) {
    return (
      <GameLauncher
        gameTitle="Waffle Sudoku"
        gameGlyph="🧇"
        gameDescription="Fill the waffle so every row, column and box has each number once. No clock — just think."
        currentTier={currentTier}
        onStart={onStart}
        accentBg="bg-amber-50 dark:bg-stone-900"
        kidName={kidName}
        subject="logic"
        difficultyNoun="puzzles"
        backHref="/town"
        hideTypePicker
        showDuration={false}
        levelPreview={(level) => (
          <div className="text-center text-sm font-semibold text-stone-600 dark:text-stone-300">
            🧇 {bandForTier(level).blurb} · Gets trickier as you solve!
          </div>
        )}
      />
    );
  }

  const clean = summary ? summary.taps_wrong === 0 : false;

  // ---- Playing / round-over ----
  return (
    <main
      className={
        isFullscreen
          ? 'relative flex h-screen flex-col items-stretch overflow-hidden overscroll-none select-none'
          : 'relative flex flex-1 flex-col items-center overflow-hidden overscroll-none p-4 select-none sm:p-6'
      }
      // The kitchen counter: the same warm marble the crane sits on.
      style={{ background: 'linear-gradient(160deg, #fdf6ec 0%, #f6e3cf 55%, #fde68a 100%)' }}
    >
      <SprinkleDecor density="scatter" style={{ zIndex: 0 }} />

      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 select-none overflow-hidden">
        <span className="absolute left-[4%] top-[12%] text-6xl opacity-[0.08] sm:text-7xl">🧇</span>
        <span className="absolute right-[5%] top-[18%] text-5xl opacity-[0.08] sm:text-6xl">🧁</span>
        <span className="absolute bottom-[10%] left-[8%] text-5xl opacity-[0.08] sm:text-6xl">🍯</span>
        <span className="absolute bottom-[14%] right-[6%] text-6xl opacity-[0.08] sm:text-7xl">🧇</span>
      </div>

      {isFullscreen ? (
        <div className="absolute right-3 top-3 z-40 flex items-center gap-2">
          <SoundToggle size="sm" />
          <FullscreenToggle size="sm" />
          <ChromeNavLink href={backHref} variant="dark" size="sm">✕ Exit</ChromeNavLink>
        </div>
      ) : (
        <header className="relative z-10 flex w-full max-w-lg items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <GamecakesLogo size={40} />
            <div>
              <div className="text-xs uppercase tracking-wider text-amber-700">Waffle Sudoku</div>
              <h1 className="text-2xl font-bold text-stone-800">
                {kidName ? `${kidName}'s Puzzle Island` : 'Puzzle Island'}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <FeedbackButton gameSlug="sudoku" kidName={kidName} />
            <SoundToggle size="sm" />
            <FullscreenToggle size="sm" />
            <ChromeNavLink href={backHref} variant="dark" size="sm">✕ Exit</ChromeNavLink>
          </div>
        </header>
      )}

      <div className="relative z-10 mt-4 flex w-full flex-1 items-center justify-center">
        {/* Square board plus a pad under it and a speech bubble over it, so the
            limiting dimension is height (the checkers formula). Windowed, the
            game caps its own tin at 100dvh − 500px (header, back link, pad);
            fullscreen has no header or back link, so the cap loosens to
            −330px via the var the tin reads. */}
        <div
          className={`w-full rounded-[2rem] border-4 border-white/80 bg-white/70 p-3 shadow-[0_12px_45px_rgba(180,140,80,0.28)] backdrop-blur-sm sm:p-4 ${
            isFullscreen ? '' : 'max-w-[560px]'
          }`}
          style={
            isFullscreen
              ? ({ maxWidth: 'min(96vw, 640px)', '--sudoku-board-max': 'calc(100dvh - 330px)' } as CSSProperties)
              : undefined
          }
        >
          <SudokuGame key={roundId} spec={spec} seed={seed} onComplete={handleComplete} />
        </div>
      </div>

      {!isFullscreen ? (
        <div className="relative z-10 mt-6 flex gap-3">
          <Link
            href={backHref}
            className="rounded-full border border-amber-300 bg-white/80 px-4 py-2 text-sm font-medium text-stone-700 shadow-sm hover:bg-white active:scale-95"
            style={{ minHeight: 'var(--min-tap-target)' }}
          >
            {backOverride?.label ?? '← Back to Map'}
          </Link>
        </div>
      ) : null}

      {/* ---- Round-over overlay ---- */}
      {phase === 'gameover' && summary ? (
        <div role="status" aria-live="polite" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div
            className="flex w-full max-w-md flex-col items-center gap-4 rounded-3xl p-8 text-center shadow-2xl"
            style={{ background: 'linear-gradient(135deg, #fde68a, #fef3c7, #bbf7d0)' }}
          >
            <div className="text-7xl animate-bounce" aria-hidden>
              {clean ? '🏆' : summary.efficiency >= 0.7 ? '🧇' : '🙂'}
            </div>
            <div className="text-3xl font-bold text-zinc-900">
              {clean ? 'Clean solve!' : summary.efficiency >= 0.7 ? 'Waffle done!' : 'Good try!'}
            </div>
            <div className="text-base text-zinc-700">
              {summary.meta_lines?.[0] ?? `${summary.optimal_taps} squares`}
              {' · '}
              <span className="font-mono">{Math.round(summary.efficiency * 100)}%</span>
            </div>
            {summary.meta_lines?.[1] ? (
              <div className="text-sm font-semibold text-amber-800">{summary.meta_lines[1]}</div>
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
                  Level {attemptResponse.currentTier} · mastery {Math.round(attemptResponse.masteryPct * 100)}%
                </div>
              )
            ) : null}

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

            <div className="mt-2 flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
              <CandyButton role="act" size="lg" onClick={nextPuzzle}>
                Next puzzle {lastClean ? '· trickier!' : '→'}
              </CandyButton>
              <ChromeNavButton onClick={beginRound} variant="dark" size="md">
                Play again
              </ChromeNavButton>
              <ChromeNavButton onClick={() => setSettings(null)} variant="dark" size="md">
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
