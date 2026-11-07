'use client';

// Sprinkle Search shell — the shared word-game shell with the word search in
// the middle.
//
// Credits the kid's grade-scoped sight-words skill through verbalSkillFor(),
// exactly the way a math game's Words mode does, so a round here lands on the
// same row the parent dashboard already tracks. No new skill, no migration.

import { useMemo } from 'react';
import WordGameShell from '@/components/games/words/WordGameShell';
import WordSearchGame from '@/components/games/word-search/WordSearchGame';
import { verbalSkillFor } from '@/lib/games/shared/challenge-mode';
import { classListSuffices, classWordsFor } from '@/lib/games/words/pool';
import { wordSearchTier } from '@/lib/games/word-search/generate';
import type { ClassWordList } from '@/lib/games/shared/focus-words';

export default function WordSearchShell({
  kidName,
  kidGrade,
  kidClassLists,
  currentTier,
  highestTier,
}: {
  kidName?: string;
  kidGrade?: number | null;
  kidClassLists?: ClassWordList[];
  currentTier: number;
  highestTier?: number;
}) {
  const skill = useMemo(() => verbalSkillFor('sight-words', kidGrade ?? null), [kidGrade]);
  const lists = useMemo(() => kidClassLists ?? [], [kidClassLists]);

  return (
    <WordGameShell
      gameSlug="word-search"
      gameTitle="Sprinkle Search"
      gameGlyph="🔍"
      gameDescription="Find the words hiding in the sprinkles — drag across each one."
      kicker="Sprinkle Search"
      title={(name) => (name ? `${name}'s Sprinkle Search` : 'Sprinkle Search')}
      kidName={kidName}
      kidClassLists={kidClassLists}
      currentTier={currentTier}
      highestTier={highestTier}
      skill={skill}
      levelPreview={(level) => {
        const cfg = wordSearchTier(level);
        const limits = { maxLen: cfg.maxLen };
        const fromClass = classListSuffices('sight-words', limits, lists);
        const usable = fromClass ? classWordsFor('sight-words', limits, lists).words.length : 0;
        return (
          <div className="mt-3 rounded-xl bg-white/80 px-4 py-3 text-center text-sm dark:bg-zinc-900/80">
            <div className="font-semibold text-stone-700 dark:text-stone-200">🔍 {cfg.blurb}</div>
            <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              {fromClass
                ? `📝 From your word list — ${Math.min(usable, cfg.count)} of your words fit this grid.`
                : lists.length > 0
                  ? 'Your word list has too few words that fit this grid, so this level uses the Gamecakes library.'
                  : 'Words from the Gamecakes library. A grown-up can add your class list on the parent page.'}
            </div>
          </div>
        );
      }}
      renderGame={(level, onComplete) => <WordSearchGame level={level} onComplete={onComplete} />}
      gameOver={(s) => ({
        emoji: s.efficiency >= 0.9 ? '🏆' : s.efficiency >= 0.6 ? '🔍' : '🙂',
        headline: s.efficiency >= 0.9 ? 'Eagle eyes!' : s.efficiency >= 0.6 ? 'Found them all!' : 'You got there!',
        line: `${s.optimal_taps} words found · ${s.taps_wrong === 0 ? 'no wrong turns' : `${s.taps_wrong} wrong turn${s.taps_wrong === 1 ? '' : 's'}`}`,
      })}
    />
  );
}
