'use client';

// Cakey Stacks shell — GameLauncher → CakeyStacksHost.
//
// The launcher carries one picker the other games don't have: "How it looks",
// 3D cake pan or 2D classic. It rides through as `settings.view` and decides
// which renderer the host loads — the rules, the questions and the scoring are
// identical either way.
//
// "Play again" bumps `runId` (part of the host's React key) so the engine, the
// renderer and any WebGL context are disposed and rebuilt for a clean pan.

import { useState } from 'react';
import GameLauncher, { type LaunchSettings } from '@/components/games/shared/GameLauncher';
import CakeyStacksHost from '@/components/games/stacks/CakeyStacksHost';
import { verbalSkillFor, mathSkillFor } from '@/lib/games/shared/challenge-mode';
import type { KidFocus } from '@/lib/games/shared/recommend';
import type { ClassWordList } from '@/lib/games/shared/focus-words';

export default function CakeyStacksShell({
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
        gameTitle="Cakey Stacks"
        gameGlyph="🍰"
        gameDescription="Stack cake slices in the pan and fill a whole layer to bake it out. Solve problems to earn Cherry Bombs — and to save the pan when it overflows!"
        currentTier={currentTier}
        highestTier={highestTier}
        onStart={setSettings}
        kidGrade={kidGrade}
        kidFocus={kidFocus}
        kidClassLists={kidClassLists}
        accentBg="bg-violet-50 dark:bg-violet-950"
        kidName={kidName}
        backHref="/town"
        showDifficulty
        showView
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
    <CakeyStacksHost
      key={runId}
      title="Cakey Stacks"
      subtitle={kidName ? `${kidName}'s Bakery` : 'Cakey Stacks'}
      kidName={kidName}
      gameSlug="cakey-stacks"
      sceneProps={{
        tier: settings.level,
        challengeMode: verbal ? verbalType : 'math',
        mathType: settings.mathType,
        difficulty: settings.difficulty,
        view: settings.view ?? '3d',
      }}
      attemptMeta={{
        subject: verbalSkill ? verbalSkill.subject : skillSubject,
        skillSlug: verbalSkill ? verbalSkill.slug : mathSkill.slug,
        tier: settings.level,
        gameSlug: 'cakey-stacks',
      }}
      onPlayAgain={() => setRunId((r) => r + 1)}
    />
  );
}
