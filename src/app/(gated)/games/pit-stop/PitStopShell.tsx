'use client';

// Cakey Pit Stop shell — GameLauncher → PitStop3DHost.
//
// Pure score-attack against the session clock, so the duration picker is the
// actual round length here (unlike the racer, where it is only a ceiling).
// "Next shift" bumps `runId` (the host's React key) so the engine + WebGL
// context are disposed and rebuilt cleanly.

import { useState } from 'react';
import GameLauncher, { type LaunchSettings } from '@/components/games/shared/GameLauncher';
import PitStop3DHost from '@/components/games/three/PitStop3DHost';
import type { CupcakeConfig } from '@/lib/cupcake/config';
import type { Difficulty } from '@/lib/games/three/pitstop/types';
import { verbalSkillFor, mathSkillFor } from '@/lib/games/shared/challenge-mode';
import type { KidFocus } from '@/lib/games/shared/recommend';
import type { ClassWordList } from '@/lib/games/shared/focus-words';

export default function PitStopShell({
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
  const [runId, setRunId] = useState(0);

  if (!settings) {
    // Full picker set — duration, question mode, maths type, difficulty. No
    // `hideTypePicker`: the jobs are ordinary arithmetic, and hiding the picker
    // silently pins the game to addition (GameLauncher ships `mathType`
    // regardless, defaulted to 'addition').
    return (
      <GameLauncher
        gameTitle="Cakey Pit Stop"
        gameGlyph="🔧"
        gameDescription="Cars pull into your pit box broken. Tap what needs fixing, answer to fix it — but a car you send away half-mended comes back!"
        currentTier={currentTier}
        highestTier={highestTier}
        onStart={setSettings}
        kidGrade={kidGrade}
        kidFocus={kidFocus}
        kidClassLists={kidClassLists}
        accentBg="bg-rose-50 dark:bg-rose-950"
        kidName={kidName}
        subject="math"
        difficultyNoun="jobs"
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
    <PitStop3DHost
      key={runId}
      title="Cakey Pit Stop"
      subtitle={kidName ? `${kidName}'s Pit Crew` : 'Cakey Pit Stop'}
      kidName={kidName}
      gameSlug="pit-stop"
      sceneProps={{
        tier: settings.level,
        challengeMode: verbal ? verbalType : 'math',
        difficulty: (settings.difficulty as Difficulty | undefined) ?? 'medium',
        mathType: settings.mathType,
        cupcakeConfig,
      }}
      attemptMeta={{
        subject: verbalSkill ? verbalSkill.subject : skillSubject,
        skillSlug: verbalSkill ? verbalSkill.slug : mathSkill.slug,
        tier: settings.level,
        gameId: null,
      }}
      onPlayAgain={() => setRunId((r) => r + 1)}
    />
  );
}
