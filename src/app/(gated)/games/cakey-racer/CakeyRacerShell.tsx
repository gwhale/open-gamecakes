'use client';

// Cakey Racer shell — GameLauncher → CakeyRacer3DHost.
//
// The round ends on the chequered flag OR the clock, so the duration picker
// stays ON (it's the ceiling, not the target). "Race again" bumps `runId` (the
// host's React key) so the whole engine + WebGL context are disposed and
// rebuilt cleanly for a fresh race.

import { useState } from 'react';
import GameLauncher, { type LaunchSettings } from '@/components/games/shared/GameLauncher';
import CakeyRacer3DHost from '@/components/games/three/CakeyRacer3DHost';
import type { CupcakeConfig } from '@/lib/cupcake/config';
import type { Difficulty } from '@/lib/games/three/racer/types';
import { verbalSkillFor, mathSkillFor } from '@/lib/games/shared/challenge-mode';
import type { KidFocus } from '@/lib/games/shared/recommend';
import type { ClassWordList } from '@/lib/games/shared/focus-words';

export default function CakeyRacerShell({
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
    // Pickers: duration, question mode (maths vs words), maths type, and
    // difficulty. Deliberately NO `hideTypePicker` — the boost gates are
    // ordinary arithmetic, so the kid chooses the operation like they do in
    // every other maths game. Hiding it does not mean "no type": GameLauncher
    // still ships `mathType`, defaulted to 'addition', so a hidden picker
    // silently locks the game to addition forever. Only Chess Puzzles and Word
    // Memory hide it, and that's because they pose no arithmetic at all.
    return (
      <GameLauncher
        gameTitle="Cakey Racer"
        gameGlyph="🏎️"
        gameDescription="Four laps of Victory Lane against three candy rivals — hold ◀ ▶ to steer, and solve the boost gates to go faster!"
        currentTier={currentTier}
        highestTier={highestTier}
        onStart={setSettings}
        kidGrade={kidGrade}
        kidFocus={kidFocus}
        kidClassLists={kidClassLists}
        accentBg="bg-amber-50 dark:bg-amber-950"
        kidName={kidName}
        subject="math"
        difficultyNoun="gates"
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
    <CakeyRacer3DHost
      key={runId}
      title="Cakey Racer"
      subtitle={kidName ? `${kidName}'s Cakey Racer` : 'Cakey Racer'}
      kidName={kidName}
      gameSlug="cakey-racer"
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
        gameSlug: 'cakey-racer',
      }}
      onPlayAgain={() => setRunId((r) => r + 1)}
    />
  );
}
