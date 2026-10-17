'use client';

// Cakey Castle Jump shell — GameLauncher (Level + Math kind + Difficulty)
// → Phaser scene. The scene has no clock of its own, so the host owns the
// session timer (hostTimer): it drains the kid's chosen 1/2/3-min pick and
// emits scene:timeUp, which the scene wires to endSession(). Everything else
// (math modal, attempt POST, game-over overlay, tokens) comes from
// PhaserGameHost.

import { useState } from 'react';
import GameLauncher, { type LaunchSettings } from '@/components/games/shared/GameLauncher';
import PhaserGameHost from '@/components/games/phaser/PhaserGameHost';
import {
  CastleJumpSceneFactory,
  CASTLE_JUMP_VIEW_W,
  CASTLE_JUMP_VIEW_H,
} from '@/lib/games/phaser/scenes/CastleJumpScene.factory';
import { verbalSkillFor, mathSkillFor } from '@/lib/games/shared/challenge-mode';
import type { KidFocus } from '@/lib/games/shared/recommend';
import type { ClassWordList } from '@/lib/games/shared/focus-words';

export default function CastleJumpShell({
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
        gameTitle="Cakey Castle Jump"
        gameGlyph="🏰"
        gameDescription="Bounce up the endless castle and open the gates — how many floors can you climb?"
        currentTier={currentTier}
        highestTier={highestTier}
        onStart={setSettings}
        kidGrade={kidGrade}
        kidFocus={kidFocus}
        kidClassLists={kidClassLists}
        accentBg="bg-rose-100 dark:bg-rose-950"
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
      title="Cakey Castle Jump"
      subtitle={kidName ? `${kidName}'s Climb` : 'Castle Climb'}
      kidName={kidName}
      gameSlug="castle-jump"
      sceneFactory={CastleJumpSceneFactory}
      sceneProps={{
        tier: settings.level,
        challengeMode: verbal ? verbalType : 'math',
        mathType: settings.mathType,
        difficulty: settings.difficulty,
      }}
      width={CASTLE_JUMP_VIEW_W}
      height={CASTLE_JUMP_VIEW_H}
      hostTimer
      attemptMeta={{
        subject: verbalSkill ? verbalSkill.subject : skillSubject,
        skillSlug: verbalSkill ? verbalSkill.slug : mathSkill.slug,
        tier: settings.level,
        gameSlug: 'castle-jump',
      }}
    />
  );
}
