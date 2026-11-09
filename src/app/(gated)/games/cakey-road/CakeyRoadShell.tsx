'use client';

// Cakey Road shell — GameLauncher → CakeyRoad3DHost.
//
// A timed (3-min) crossy-hopper, so the duration picker stays ON. "Play again"
// bumps `runId` (the host's React key) so the whole engine + WebGL context are
// disposed and rebuilt cleanly for a fresh endless run.

import { useState } from 'react';
import GameLauncher, { type LaunchSettings } from '@/components/games/shared/GameLauncher';
import CakeyRoad3DHost from '@/components/games/three/CakeyRoad3DHost';
import type { CupcakeConfig } from '@/lib/cupcake/config';
import type { Difficulty } from '@/lib/games/three/cakeyroad/types';
import { verbalSkillFor, mathSkillFor } from '@/lib/games/shared/challenge-mode';
import type { KidFocus } from '@/lib/games/shared/recommend';
import type { ClassWordList } from '@/lib/games/shared/focus-words';

export default function CakeyRoadShell({
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
    // `hideTypePicker` was dropped here (it arrived with #144 and neither the
    // commit nor the forked parents — Cakey Chase, Castle — set it, so it was a
    // copy rather than a decision). It does not mean "this game has no maths
    // type": GameLauncher ships `mathType` unconditionally, defaulted to
    // 'addition', so hiding the picker silently pinned every kid to addition
    // and made subtraction/multiplication/mixed unreachable in a game whose
    // gates are ordinary arithmetic.
    return (
      <GameLauncher
        gameTitle="Cakey Cross"
        gameGlyph="🧁"
        gameDescription="Build your path brick by brick. Hop across candy roads, syrup rivers, and train tracks, then solve the gates!"
        currentTier={currentTier}
        highestTier={highestTier}
        onStart={setSettings}
        kidGrade={kidGrade}
        kidFocus={kidFocus}
        kidClassLists={kidClassLists}
        accentBg="bg-sky-50 dark:bg-sky-950"
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
    <CakeyRoad3DHost
      key={runId}
      title="Cakey Cross"
      subtitle={kidName ? `${kidName}'s Brick Run` : 'Brick Run'}
      kidName={kidName}
      gameSlug="cakey-road"
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
        gameSlug: 'cakey-road',
      }}
      onPlayAgain={() => setRunId((r) => r + 1)}
    />
  );
}
