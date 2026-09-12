'use client';

// BA Word Memory shell — anonymous twin of the gated WordMemoryShell.
//
// Same launcher → game → game-over state machine, minus everything that
// needs an account: no /api/attempts POST (nothing to save), no kid name,
// no FeedbackButton (the feedback API requires a family session). Keep
// this file dependency-light — every import here must work without auth.

import { useCallback, useState } from 'react';
import { ChromeNavButton, ChromeNavLink } from '@/components/ui/ChromeNavLink';
import GameLauncher, {
  type LaunchSettings,
} from '@/components/games/shared/GameLauncher';
import GamecakesLogo from '@/components/GamecakesLogo';
import FullscreenToggle from '@/components/FullscreenToggle';
import SoundToggle from '@/components/SoundToggle';
import { useIsFullscreen } from '@/hooks/useIsFullscreen';
import { DEFAULT_DURATION_MIN } from '@/lib/games/session-duration';
import type { SessionSummary } from '@/lib/games/phaser/session';
import WordMemoryGame from '@/components/games/word-memory/WordMemoryGame';
import WordListPreview from '@/components/games/word-memory/WordListPreview';

type Phase = 'playing' | 'gameover';

export default function BaWordMemoryShell() {
  const [settings, setSettings] = useState<LaunchSettings | null>(null);
  const [phase, setPhase] = useState<Phase>('playing');
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  // Bumps on "Play Again" so the game remounts fresh (same key trick as
  // the gated shell).
  const [roundId, setRoundId] = useState(0);

  const isFullscreen = useIsFullscreen();

  const handleComplete = useCallback((s: SessionSummary) => {
    setSummary(s);
    setPhase('gameover');
  }, []);

  const resetForNewRound = useCallback(() => {
    setSummary(null);
    setPhase('playing');
    setRoundId((r) => r + 1);
  }, []);

  // ---- Launcher ----
  if (!settings) {
    return (
      <GameLauncher
        gameTitle="Word Memory"
        gameGlyph="🎴"
        gameDescription="Flip the cards, find the matching sight words"
        currentTier={1}
        onStart={setSettings}
        accentBg="bg-blue-100 dark:bg-blue-950"
        subject="reading"
        backHref="/ba"
        backLabel="← Back to menu"
        levelPreview={(level) => <WordListPreview listId={level} />}
        hideTypePicker
        unlockAllLevels
      />
    );
  }

  // ---- Playing / game-over — shared chrome ----
  return (
    <main
      className={
        isFullscreen
          ? 'flex h-screen flex-col items-stretch overscroll-none bg-blue-950 select-none'
          : 'flex flex-1 flex-col items-center overscroll-none bg-blue-950 p-4 select-none sm:p-6'
      }
    >
      {isFullscreen ? (
        <div className="absolute right-3 top-3 z-40 flex items-center gap-2">
          <SoundToggle size="sm" />
          <FullscreenToggle size="sm" />
        </div>
      ) : (
        <header className="flex w-full max-w-2xl items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <GamecakesLogo size={40} />
            <div>
              <div className="text-xs uppercase tracking-wider text-amber-300">
                Word Memory
              </div>
              <h1 className="text-2xl font-bold text-amber-100">Memory Match</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SoundToggle size="sm" />
            <FullscreenToggle size="sm" />
          </div>
        </header>
      )}

      <div className="mt-4 w-full flex justify-center">
        <WordMemoryGame
          key={`${settings.level}-${roundId}`}
          listId={settings.level}
          capSeconds={(settings.duration ?? DEFAULT_DURATION_MIN) * 60}
          onComplete={handleComplete}
        />
      </div>

      {!isFullscreen ? (
        <div className="mt-6 flex gap-3">
          <ChromeNavLink href="/ba" variant="dark" size="md">
            ← Back to menu
          </ChromeNavLink>
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
              {summary.efficiency >= 0.9 ? '🏆' : summary.efficiency >= 0.7 ? '⭐' : '🎴'}
            </div>
            <div className="text-3xl font-bold text-zinc-900">
              {summary.efficiency >= 0.9
                ? 'Amazing!'
                : summary.efficiency >= 0.7
                  ? 'Nice match!'
                  : 'All pairs found!'}
            </div>
            <div className="text-base text-zinc-700">
              <span className="font-mono font-bold">{summary.taps_total}</span>{' '}
              moves ·{' '}
              <span className="font-mono">{Math.round(summary.efficiency * 100)}%</span>{' '}
              efficient
              {' · '}
              <span className="font-mono">
                {Math.floor(summary.session_ms / 60000)}:
                {Math.floor((summary.session_ms % 60000) / 1000)
                  .toString()
                  .padStart(2, '0')}
              </span>
            </div>

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
                Change list
              </ChromeNavButton>
              <ChromeNavLink href="/ba" variant="dark" size="lg">
                ← Back to menu
              </ChromeNavLink>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
