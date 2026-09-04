'use client';

// Flappy Math shell — picks level/math type via GameLauncher, then mounts
// the Phaser-based game. The old SVG-based FlappyMath component has been
// retired; see src/lib/games/phaser/scenes/FlappyScene.ts for the port.

import { useState } from 'react';
import GameLauncher, { type LaunchSettings } from '@/components/games/shared/GameLauncher';
import PhaserGameHost from '@/components/games/phaser/PhaserGameHost';
import {
  FlappySceneFactory,
  FLAPPY_VIEW_H,
  FLAPPY_VIEW_W,
} from '@/lib/games/phaser/scenes/FlappyScene.factory';
import { verbalSkillFor, mathSkillFor } from '@/lib/games/shared/challenge-mode';
import type { KidFocus } from '@/lib/games/shared/recommend';
import type { CupcakeConfig } from '@/lib/cupcake/config';
import type { ClassWordList } from '@/lib/games/shared/focus-words';

export default function FlappyShell({
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
        gameTitle="Flappy Math"
        gameGlyph="🐦"
        gameDescription="Fly and solve to survive"
        currentTier={currentTier}
        highestTier={highestTier}
        onStart={setSettings}
        kidGrade={kidGrade}
        kidFocus={kidFocus}
        kidClassLists={kidClassLists}
        accentBg="bg-rose-50 dark:bg-rose-950"
        kidName={kidName}
        showDifficulty
        showControls
        showVerbalMode
        verbalCurrentTier={verbalCurrentTier}
        verbalHighestTier={verbalHighestTier}
      />
    );
  }

  // Words mode credits the synonyms vocabulary skill; math credits the game's
  // own math skill. The scene reads `challengeMode` to pick the question set.
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
      title="Flappy Math"
      subtitle={kidName ? `${kidName}'s Flight` : 'Take Flight'}
      kidName={kidName}
      gameSlug="flappy-math"
      sceneFactory={FlappySceneFactory}
      sceneProps={{
        tier: settings.level,
        challengeMode: verbal ? verbalType : 'math',
        mathType: settings.mathType,
        difficulty: settings.difficulty,
        controls: settings.controls,
        cupcakeConfig,
      }}
      width={FLAPPY_VIEW_W}
      height={FLAPPY_VIEW_H}
      attemptMeta={{
        subject: verbalSkill ? verbalSkill.subject : skillSubject,
        skillSlug: verbalSkill ? verbalSkill.slug : mathSkill.slug,
        tier: settings.level,
        gameSlug: 'flappy-math',
      }}
    />
  );
}
