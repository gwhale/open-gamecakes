'use client';

// BA Flappy Math shell — radically simplified for non-users.
//
// The gated FlappyShell front-loads a 10-level grid + math-type +
// difficulty + controls pickers. Visitors to /ba have never seen the
// platform, so the entire launcher is two giant buttons: pick a math
// style, and the game starts on that same tap. Everything else is
// pinned to the friendliest preset (easy physics, tap-to-flap,
// numbers ≤ 10) and nothing is saved.

import { useState } from 'react';
import PhaserGameHost from '@/components/games/phaser/PhaserGameHost';
import GamecakesLogo from '@/components/GamecakesLogo';
import { ChromeNavLink } from '@/components/ui/ChromeNavLink';
import {
  FlappySceneFactory,
  FLAPPY_VIEW_H,
  FLAPPY_VIEW_W,
} from '@/lib/games/phaser/scenes/FlappyScene.factory';

type MathMode = 'make-ten' | 'easy-add';

const MODES: {
  value: MathMode;
  emoji: string;
  label: string;
  blurb: string;
  example: string;
}[] = [
  {
    value: 'make-ten',
    emoji: '🎯',
    label: 'Make 10',
    blurb: 'Type the missing number',
    example: '7 + ❓ = 10',
  },
  {
    value: 'easy-add',
    emoji: '➕',
    label: 'Easy Math',
    blurb: 'Adding, answers up to 10',
    example: '4 + 3 = ?',
  },
];

export default function BaFlappyShell() {
  const [mode, setMode] = useState<MathMode | null>(null);

  // ---- Two-button launcher — tapping a mode IS the start button ----
  if (!mode) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
        <header className="flex flex-col items-center text-center">
          <GamecakesLogo size={72} />
          <h1 className="font-display mt-3 text-3xl font-bold">Flappy Math 🐦</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Tap to flap. Answer the math gates to keep flying!
          </p>
        </header>

        <div className="grid w-full max-w-md grid-cols-1 gap-4 sm:grid-cols-2">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => {
                // Same user-gesture fullscreen request every game launcher
                // does — has to happen inside the click frame.
                try {
                  const root = document.documentElement as HTMLElement & {
                    webkitRequestFullscreen?: () => Promise<void>;
                  };
                  if (!document.fullscreenElement) {
                    if (root.requestFullscreen) {
                      root.requestFullscreen().catch(() => { /* optional */ });
                    } else if (root.webkitRequestFullscreen) {
                      root.webkitRequestFullscreen();
                    }
                  }
                } catch {
                  // Fullscreen is a nice-to-have — game still works without it.
                }
                setMode(m.value);
              }}
              className="flex flex-col items-center gap-2 rounded-3xl bg-white p-6 shadow-xl transition-all hover:scale-[1.03] hover:shadow-2xl active:scale-[0.97] dark:bg-zinc-900"
              style={{ minHeight: 'var(--min-tap-target)' }}
            >
              <span className="text-6xl" aria-hidden>{m.emoji}</span>
              <span className="font-display text-2xl font-bold">{m.label}</span>
              <span className="rounded-full bg-sky-100 px-4 py-1 font-mono text-lg font-bold text-sky-800 dark:bg-sky-950 dark:text-sky-200">
                {m.example}
              </span>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">{m.blurb}</span>
            </button>
          ))}
        </div>

        <ChromeNavLink href="/ba" variant="dark" size="md">← Back to menu</ChromeNavLink>
      </main>
    );
  }

  // ---- Game — friendliest fixed preset, nothing saved ----
  return (
    <PhaserGameHost
      title="Flappy Math"
      subtitle={mode === 'make-ten' ? 'Make 10!' : 'Easy Math'}
      gameSlug="flappy-math"
      sceneFactory={FlappySceneFactory}
      sceneProps={{
        // Tier 2 = sums within 10 for the 'easy-add' generator; the
        // make-ten generator ignores tier entirely.
        tier: 2,
        subject: 'math',
        mathType: 'addition',
        mathStyle: mode === 'make-ten' ? 'make-ten' : 'standard',
        birdStyle: 'ba-bear',
        difficulty: 'easy',
        controls: 'tap',
      }}
      width={FLAPPY_VIEW_W}
      height={FLAPPY_VIEW_H}
      backHref="/ba"
      backLabel="← Back to menu"
      // No attemptMeta — anonymous play, nothing posts to /api/attempts.
    />
  );
}
