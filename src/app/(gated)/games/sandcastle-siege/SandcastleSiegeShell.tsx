'use client';

// Sandcastle Siege shell — GameLauncher → SandcastleGameHost.
//
// Took over from the Phaser Water Balloons (since removed): same drag-release
// slingshot, but the host is the Three.js engine wrapper.
// "Play again" bumps `runId`, which is part of the host's React key, so the
// whole engine (and its WebGL context) is disposed and rebuilt cleanly.

import { useState } from 'react';
import GameLauncher, { type LaunchSettings } from '@/components/games/shared/GameLauncher';
import SandcastleGameHost from '@/components/games/three/SandcastleGameHost';
import { verbalSkillFor, mathSkillFor } from '@/lib/games/shared/challenge-mode';
import type { KidFocus } from '@/lib/games/shared/recommend';
import type { ClassWordList } from '@/lib/games/shared/focus-words';

export default function SandcastleSiegeShell({
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
        gameTitle="Sandcastle Siege"
        gameGlyph="🏖️"
        gameDescription="Solve, slingshot, splash — flatten the sand city in 3 minutes"
        currentTier={currentTier}
        highestTier={highestTier}
        onStart={setSettings}
        kidGrade={kidGrade}
        kidFocus={kidFocus}
        kidClassLists={kidClassLists}
        accentBg="bg-yellow-50 dark:bg-yellow-950"
        kidName={kidName}
        backHref="/town"
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
    <SandcastleGameHost
      key={runId}
      title="Sandcastle Siege"
      subtitle={kidName ? `${kidName}'s Siege` : 'Sandcastle Siege'}
      kidName={kidName}
      gameSlug="sandcastle-siege"
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
        gameSlug: 'sandcastle-siege',
      }}
      onPlayAgain={() => setRunId((r) => r + 1)}
    />
  );
}
