'use client';

// Sharks & Minnows — client shell. GameLauncher → Phaser scene.
// Original SVG/React SharksAndMinnows component retired; see
// src/lib/games/phaser/scenes/SharksAndMinnowsScene.ts.

import { useState } from 'react';
import GameLauncher, { type LaunchSettings } from '@/components/games/shared/GameLauncher';
import PhaserGameHost from '@/components/games/phaser/PhaserGameHost';
import {
  SharksAndMinnowsSceneFactory,
  SHARKS_MINNOWS_VIEW_H,
  SHARKS_MINNOWS_VIEW_W,
} from '@/lib/games/phaser/scenes/SharksAndMinnowsScene.factory';
import { verbalSkillFor, mathSkillFor } from '@/lib/games/shared/challenge-mode';
import type { KidFocus } from '@/lib/games/shared/recommend';
import type { ClassWordList } from '@/lib/games/shared/focus-words';

export default function SharksShell({
  kidName,
  kidGrade,
  kidFocus,
  kidClassLists,
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
        gameTitle="Sharks & Minnows"
        gameGlyph="🦈"
        gameDescription="Catch fish with quick math"
        currentTier={currentTier}
        highestTier={highestTier}
        onStart={setSettings}
        kidGrade={kidGrade}
        kidFocus={kidFocus}
        kidClassLists={kidClassLists}
        accentBg="bg-cyan-50 dark:bg-cyan-950"
        kidName={kidName}
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
      title="Sharks & Minnows"
      subtitle={kidName ? `${kidName}'s Ocean` : 'The Ocean'}
      kidName={kidName}
      gameSlug="sharks-minnows"
      // No scene-side clock, so the host provides the time cap.
      hostTimer
      sceneFactory={SharksAndMinnowsSceneFactory}
      sceneProps={{
        tier: settings.level,
        challengeMode: verbal ? verbalType : 'math',
        mathType: settings.mathType,
      }}
      width={SHARKS_MINNOWS_VIEW_W}
      height={SHARKS_MINNOWS_VIEW_H}
      attemptMeta={{
        subject: verbalSkill ? verbalSkill.subject : skillSubject,
        skillSlug: verbalSkill ? verbalSkill.slug : mathSkill.slug,
        tier: settings.level,
        gameSlug: 'sharks-minnows',
      }}
    />
  );
}
