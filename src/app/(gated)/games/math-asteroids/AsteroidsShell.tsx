'use client';

// Math Asteroids shell — GameLauncher (with Difficulty picker) → Phaser
// scene. Asteroid physics live in AsteroidsScene; everything else (modal,
// attempt POST, game-over overlay) is inherited from PhaserGameHost.

import { useState } from 'react';
import GameLauncher, { type LaunchSettings } from '@/components/games/shared/GameLauncher';
import PhaserGameHost from '@/components/games/phaser/PhaserGameHost';
import {
  AsteroidsSceneFactory,
  ASTEROIDS_VIEW_H,
  ASTEROIDS_VIEW_W,
} from '@/lib/games/phaser/scenes/AsteroidsScene.factory';
import { verbalSkillFor, mathSkillFor } from '@/lib/games/shared/challenge-mode';
import type { KidFocus } from '@/lib/games/shared/recommend';
import type { CupcakeConfig } from '@/lib/cupcake/config';
import type { ClassWordList } from '@/lib/games/shared/focus-words';

export default function AsteroidsShell({
  kidName,
  kidGrade,
  kidFocus,
  kidClassLists,
  cupcakeConfig,
  currentTier,
  highestTier,
  skillSubject,
  skillSlug,
  verbalCurrentTier,
  verbalHighestTier,
}: {
  kidName?: string;
  kidGrade?: number | null;
  kidFocus?: KidFocus | null;
  kidClassLists?: ClassWordList[];
  cupcakeConfig?: CupcakeConfig;
  currentTier: number;
  highestTier?: number;
  skillSubject: 'math' | 'reading';
  skillSlug: string;
  verbalCurrentTier: number;
  verbalHighestTier: number;
}) {
  const [settings, setSettings] = useState<LaunchSettings | null>(null);

  if (!settings) {
    return (
      <GameLauncher
        gameTitle="Math Asteroids"
        gameGlyph="☄️"
        gameDescription="Shoot rocks, solve math to destroy"
        currentTier={currentTier}
        highestTier={highestTier}
        onStart={setSettings}
        kidGrade={kidGrade}
        kidFocus={kidFocus}
        kidClassLists={kidClassLists}
        accentBg="bg-violet-100 dark:bg-violet-950"
        kidName={kidName}
        showDifficulty
        showVerbalMode
        verbalCurrentTier={verbalCurrentTier}
        verbalHighestTier={verbalHighestTier}
      />
    );
  }

  const verbal = settings.mode === 'verbal';
  const verbalType = settings.readingType ?? 'synonyms';
  const verbalSkill = verbal ? verbalSkillFor(verbalType, kidGrade ?? null, verbalCurrentTier) : null;
  // The math skill is derived per-round from what the kid actually chose,
  // not from the page's static SKILL_SLUG. That constant is still the
  // launcher's tier lookup (the ★ marker); it is no longer what gets
  // credited. See mathSkillFor() for why.
  const mathSkill = mathSkillFor(settings.mathType ?? 'mixed', settings.level);

  return (
    <PhaserGameHost
      title="Math Asteroids"
      subtitle={kidName ? `${kidName}'s Launch` : 'Take Flight'}
      kidName={kidName}
      gameSlug="math-asteroids"
      sceneFactory={AsteroidsSceneFactory}
      sceneProps={{
        tier: settings.level,
        challengeMode: verbal ? verbalType : 'math',
        mathType: settings.mathType,
        difficulty: settings.difficulty,
        cupcakeConfig,
      }}
      width={ASTEROIDS_VIEW_W}
      height={ASTEROIDS_VIEW_H}
      attemptMeta={{
        subject: verbalSkill ? verbalSkill.subject : skillSubject,
        skillSlug: verbalSkill ? verbalSkill.slug : mathSkill.slug,
        tier: settings.level,
        gameSlug: 'math-asteroids',
      }}
    />
  );
}
