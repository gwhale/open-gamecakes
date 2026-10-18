'use client';

// Cakey Chase shell — picks tier + Problem Type via GameLauncher, then mounts
// the three.js 3D host (CakeyChase3DHost). Tier scales ghost speed AND drives
// generateMathChallenge for the gates that fire on power-up / caught.
//
// The 3D version replaces the Phaser scene in place; PacmanCakeyScene + its
// factory are kept in the tree (unwired) as a fallback.

import { useState } from 'react';
import GameLauncher, { type LaunchSettings } from '@/components/games/shared/GameLauncher';
import CakeyChase3DHost from '@/components/games/three/CakeyChase3DHost';
import { verbalSkillFor, mathSkillFor } from '@/lib/games/shared/challenge-mode';
import type { KidFocus } from '@/lib/games/shared/recommend';
import type { ClassWordList } from '@/lib/games/shared/focus-words';

export default function PacmanCakeyShell({
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
}): React.ReactElement {
  const [settings, setSettings] = useState<LaunchSettings | null>(null);
  const [runId, setRunId] = useState(0);

  if (!settings) {
    return (
      <GameLauncher
        gameTitle="Cakey Chase"
        gameGlyph="🧁"
        gameDescription="Eat the cookies, dodge the cake holes!"
        currentTier={currentTier}
        highestTier={highestTier}
        onStart={setSettings}
        kidGrade={kidGrade}
        kidFocus={kidFocus}
        kidClassLists={kidClassLists}
        accentBg="bg-indigo-50 dark:bg-indigo-950"
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
    <CakeyChase3DHost
      key={runId}
      title="Cakey Chase"
      subtitle={kidName ? `${kidName}'s Chase` : 'Cake Hole Chase'}
      kidName={kidName}
      gameSlug="pacman-cakey"
      sceneProps={{ tier: settings.level, challengeMode: verbal ? verbalType : 'math', mathType: settings.mathType }}
      attemptMeta={{ subject: verbalSkill ? verbalSkill.subject : skillSubject, skillSlug: verbalSkill ? verbalSkill.slug : mathSkill.slug, tier: settings.level, gameSlug: 'pacman-cakey' }}
      onPlayAgain={() => setRunId((n) => n + 1)}
    />
  );
}
