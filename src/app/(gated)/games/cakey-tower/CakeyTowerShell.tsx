'use client';

// Cakey Towers shell — GameLauncher → CakeyTower3DHost.
//
// A candy-tower demolition puzzle: solve a problem to earn a BITE, tap a good
// candy to eat it, don't let a bad treat splat. No timer — it's a lives-based
// puzzle, so the duration picker is hidden. "Play again" bumps `runId` (part of
// the host's React key) so the whole engine + WebGL context are disposed and
// rebuilt cleanly for a fresh tower.

import { useState } from 'react';
import GameLauncher, { type LaunchSettings } from '@/components/games/shared/GameLauncher';
import CakeyTower3DHost from '@/components/games/three/CakeyTower3DHost';
import { verbalSkillFor, mathSkillFor } from '@/lib/games/shared/challenge-mode';
import type { KidFocus } from '@/lib/games/shared/recommend';
import type { ClassWordList } from '@/lib/games/shared/focus-words';

export default function CakeyTowerShell({
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
        gameTitle="Cakey Towers"
        gameGlyph="🍬"
        gameDescription="Solve to earn a bite — eat the good candies without letting a cherry tumble and splat!"
        currentTier={currentTier}
        highestTier={highestTier}
        onStart={setSettings}
        kidGrade={kidGrade}
        kidFocus={kidFocus}
        kidClassLists={kidClassLists}
        accentBg="bg-pink-50 dark:bg-pink-950"
        kidName={kidName}
        backHref="/town"
        showDifficulty
        showDuration={false}
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
    <CakeyTower3DHost
      key={runId}
      title="Cakey Towers"
      subtitle={kidName ? `${kidName}'s Tower` : 'Cakey Towers'}
      kidName={kidName}
      gameSlug="cakey-tower"
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
        gameSlug: 'cakey-tower',
      }}
      onPlayAgain={() => setRunId((r) => r + 1)}
    />
  );
}
