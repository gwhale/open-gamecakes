'use client';

// Cakey's Frosting Fighter — client shell. GameLauncher → 3D flight host.
//
// Mirrors the other 3D shells: "Fly again" bumps `runId`, which is part of the
// host's React key, so the whole engine (and its WebGL context) is disposed and
// rebuilt cleanly. Opts into the Difficulty picker (showDifficulty) — the engine
// uses it to tune spawn rate + enemy speed.

import { useState } from 'react';
import GameLauncher, { type LaunchSettings } from '@/components/games/shared/GameLauncher';
import FrostingFighter3DHost from '@/components/games/three/FrostingFighter3DHost';
import { verbalSkillFor, mathSkillFor } from '@/lib/games/shared/challenge-mode';
import type { KidFocus } from '@/lib/games/shared/recommend';
import type { ClassWordList } from '@/lib/games/shared/focus-words';

export default function FrostingFighterShell({
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
  const [runId, setRunId] = useState(0);

  if (!settings) {
    return (
      <GameLauncher
        gameTitle="Cakey's Frosting Fighter"
        gameGlyph="✈️"
        gameDescription="Fly the cupcake-rocket — blast gummies, solve math to reload!"
        currentTier={currentTier}
        highestTier={highestTier}
        onStart={setSettings}
        kidGrade={kidGrade}
        kidFocus={kidFocus}
        kidClassLists={kidClassLists}
        accentBg="bg-violet-50 dark:bg-violet-950"
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
    <FrostingFighter3DHost
      key={runId}
      title="Cakey's Frosting Fighter"
      subtitle={kidName ? `${kidName}'s Flight` : 'Candy-Space Run'}
      kidName={kidName}
      gameSlug="frosting-fighter"
      sceneProps={{
        tier: settings.level,
        challengeMode: verbal ? verbalType : 'math',
        mathType: settings.mathType,
        difficulty: settings.difficulty,
      }}
      attemptMeta={{
        subject: verbalSkill ? verbalSkill.subject : skillSubject,
        skillSlug: verbalSkill ? verbalSkill.slug : mathSkill.slug,
        tier: settings.level,
        gameSlug: 'frosting-fighter',
      }}
      onPlayAgain={() => setRunId((r) => r + 1)}
    />
  );
}
