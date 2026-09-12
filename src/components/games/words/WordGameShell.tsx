'use client';

// The shell both word games share: GameLauncher → the game → game-over.
//
// Word Search and Cakey's Candles are pure React/DOM games, so — like Word
// Memory and Chess Puzzles — they do not run inside PhaserGameHost and have to
// carry the launcher → playing → gameover machine, the header chrome and the
// /api/attempts POST themselves. Those two games each carry their own copy;
// this is the same machine once, parameterised, because the two word games
// differ only in what sits in the middle and what the game-over card says.
//
// Duration is off: neither game has a clock. There is no time pressure in a
// word search and none in spelling a word out loud, and DESIGN.md forbids
// adding it for flavour.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChromeNavButton, ChromeNavLink } from '@/components/ui/ChromeNavLink';
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
import type { SessionSummary } from '@/lib/games/phaser/session';
import type { ClassWordList } from '@/lib/games/shared/focus-words';
import SugarTokenIcon from '@/components/wallet/SugarTokenIcon';

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

export interface GameOverCopy {
  emoji: string;
  headline: string;
  /** The one-line result under the headline. */
  line: string;
}

export interface WordGameShellProps {
  gameSlug: string;
  gameTitle: string;
  gameGlyph: string;
  gameDescription: string;
  /** Small caps above the header title, e.g. "Sprinkle Search". */
  kicker: string;
  /** Header title, given the kid's name if there is one. */
  title: (kidName?: string) => string;
  kidName?: string;
  /** This kid's active class lists, handed to the launcher so setClassLists()
   *  runs on Play — the same hand-off every math game does. */
  kidClassLists?: ClassWordList[];
  currentTier: number;
  highestTier?: number;
  /** What a finished round credits. Both games credit an existing reading
   *  skill through verbalSkillFor(); see the per-game shells. */
  skill: { subject: 'reading'; slug: string };
  levelPreview: (level: number) => ReactNode;
  /** The game itself. Remounted by `key` for each round. */
  renderGame: (level: number, onComplete: (s: SessionSummary) => void) => ReactNode;
  gameOver: (summary: SessionSummary) => GameOverCopy;
}

export default function WordGameShell({
  gameSlug,
  gameTitle,
  gameGlyph,
  gameDescription,
  kicker,
  title,
  kidName,
  kidClassLists,
  currentTier,
  highestTier,
  skill,
  levelPreview,
  renderGame,
  gameOver,
}: WordGameShellProps) {
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
  const backOverride = useGameBackTarget();
  const backHref = backOverride?.href ?? '/town';

  const handleComplete = useCallback((s: SessionSummary) => {
    setSummary(s);
    setPhase('gameover');
  }, []);

  // Same shape as WordMemoryShell: every setState is inside the fetch
  // callbacks, never in the effect body.
  useEffect(() => {
    if (phase !== 'gameover' || !summary || !settings || postedRef.current) return;
    postedRef.current = true;
    fetch('/api/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: skill.subject,
        skillSlug: skill.slug,
        tier: settings.level,
        gameSlug,
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
        console.warn(`[${gameSlug}] POST /api/attempts failed:`, err);
        setAttemptError(true);
      });
  }, [phase, summary, settings, skill, gameSlug]);

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
    // subject="reading" so the level copy talks about words; the word-kind
    // picker is hidden because each game IS one kind (sight words, spelling).
    return (
      <GameLauncher
        gameTitle={gameTitle}
        gameGlyph={gameGlyph}
        gameDescription={gameDescription}
        currentTier={currentTier}
        highestTier={highestTier}
        onStart={setSettings}
        accentBg="bg-rose-50 dark:bg-stone-900"
        kidName={kidName}
        kidClassLists={kidClassLists}
        subject="reading"
        difficultyNoun="words"
        backHref="/town"
        hideTypePicker
        showDuration={false}
        levelPreview={levelPreview}
      />
    );
  }

  const over = phase === 'gameover' && summary ? gameOver(summary) : null;

  // ---- Playing / game-over ----
  return (
    <main
      className={
        isFullscreen
          ? 'relative flex h-screen flex-col items-stretch overflow-y-auto overscroll-none select-none'
          : 'relative flex flex-1 flex-col items-center overscroll-none p-4 select-none sm:p-6'
      }
      style={{ background: 'linear-gradient(160deg, #fff1f2 0%, #fef3c7 48%, #dcfce7 100%)' }}
    >
      <SprinkleDecor density="scatter" style={{ zIndex: 0 }} />

      {isFullscreen ? (
        <div className="absolute right-3 top-3 z-40 flex items-center gap-2">
          <SoundToggle size="sm" />
          <FullscreenToggle size="sm" />
          <ChromeNavLink href={backHref} variant="dark" size="sm">✕ Exit</ChromeNavLink>
        </div>
      ) : (
        <header className="relative z-10 flex w-full max-w-2xl items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <GamecakesLogo size={40} />
            <div>
              <div className="text-xs uppercase tracking-wider text-rose-500">{kicker}</div>
              <h1 className="font-display text-2xl font-bold text-stone-800">{title(kidName)}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <FeedbackButton gameSlug={gameSlug} kidName={kidName} />
            <SoundToggle size="sm" />
            <FullscreenToggle size="sm" />
            <ChromeNavLink href={backHref} variant="dark" size="sm">✕ Exit</ChromeNavLink>
          </div>
        </header>
      )}

      <div className={`relative z-10 mt-4 flex w-full justify-center ${isFullscreen ? 'px-4 pt-12' : ''}`}>
        <div key={`${settings.level}-${roundId}`} className="flex w-full justify-center">
          {renderGame(settings.level, handleComplete)}
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
      {over && summary ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div
            className="flex w-full max-w-md flex-col items-center gap-4 rounded-3xl p-8 text-center shadow-2xl"
            style={{ background: 'linear-gradient(135deg, #fecdd3, #fef3c7, #bbf7d0)' }}
          >
            <div className="text-7xl motion-safe:animate-bounce" aria-hidden>
              {over.emoji}
            </div>
            <div className="font-display text-3xl font-bold text-zinc-900">{over.headline}</div>
            <div className="text-base text-zinc-700">{over.line}</div>
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
                className="rounded-full px-6 py-4 font-display text-lg font-semibold text-white shadow-md active:scale-95"
                style={{
                  background:
                    'linear-gradient(to right, var(--brand-strawberry, #fb7185), var(--brand-strawberry-deep, #e11d48))',
                  minHeight: 'var(--min-tap-target)',
                }}
              >
                Play Again
              </button>
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
            @media (prefers-reduced-motion: reduce) {
              @keyframes coin-land { from { opacity: 0; } to { opacity: 1; } }
            }
          `}</style>
        </div>
      ) : null}
    </main>
  );
}
