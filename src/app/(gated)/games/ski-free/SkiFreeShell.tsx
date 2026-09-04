'use client';

// Meringue Downhill shell — GameLauncher (Difficulty picker) → Phaser scene.
// The scene has no clock of its own, so we hand the host the session timer
// (hostTimer) which drains the kid's chosen 1/2/3 min and emits scene:timeUp.
// Everything else (math modal, attempt POST, game-over overlay, tokens) is
// inherited from PhaserGameHost.

import { useState } from 'react';
import GameLauncher, { type LaunchSettings } from '@/components/games/shared/GameLauncher';
import PhaserGameHost from '@/components/games/phaser/PhaserGameHost';
import {
  SkiFreeSceneFactory,
  SKI_FREE_VIEW_H,
  SKI_FREE_VIEW_W,
} from '@/lib/games/phaser/scenes/SkiFreeScene.factory';
import { verbalSkillFor, mathSkillFor } from '@/lib/games/shared/challenge-mode';
import type { KidFocus } from '@/lib/games/shared/recommend';
import type { CupcakeConfig } from '@/lib/cupcake/config';
import type { ClassWordList } from '@/lib/games/shared/focus-words';

export default function SkiFreeShell({
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
        gameTitle="Meringue Downhill"
        gameGlyph="⛷️"
        gameDescription="Ski the slalom, solve the gates, outrun the Yeti!"
        currentTier={currentTier}
        highestTier={highestTier}
        onStart={setSettings}
        kidGrade={kidGrade}
        kidFocus={kidFocus}
        kidClassLists={kidClassLists}
        accentBg="bg-sky-100 dark:bg-sky-950"
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
      title="Meringue Downhill"
      subtitle={kidName ? `${kidName}'s Run` : 'Downhill'}
      kidName={kidName}
      gameSlug="ski-free"
      sceneFactory={SkiFreeSceneFactory}
      sceneProps={{
        tier: settings.level,
        challengeMode: verbal ? verbalType : 'math',
        mathType: settings.mathType,
        difficulty: settings.difficulty,
        cupcakeConfig,
      }}
      width={SKI_FREE_VIEW_W}
      height={SKI_FREE_VIEW_H}
      hostTimer
      attemptMeta={{
        subject: verbalSkill ? verbalSkill.subject : skillSubject,
        skillSlug: verbalSkill ? verbalSkill.slug : mathSkill.slug,
        tier: settings.level,
        gameSlug: 'ski-free',
      }}
    />
  );
}
