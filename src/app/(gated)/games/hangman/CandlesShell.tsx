'use client';

// Cakey's Candles shell — the shared word-game shell with the candles game in the
// middle.
//
// Credits `spelling-patterns` through verbalSkillFor('spelling'), the same
// row the Spell-it word kind credits in every math game's Words mode. No new
// skill, no migration. The route stays /games/hangman for the grown-ups who
// look for it under that name; nothing a kid reads says it.

import { useMemo } from 'react';
import WordGameShell from '@/components/games/words/WordGameShell';
import CandlesGame, { WORDS_PER_ROUND } from '@/components/games/hangman/CandlesGame';
import { verbalSkillFor } from '@/lib/games/shared/challenge-mode';
import { classListSuffices, classWordsFor } from '@/lib/games/words/pool';
import { maxMissesForTier, revealsVowels } from '@/lib/games/hangman/state';
import type { ClassWordList } from '@/lib/games/shared/focus-words';

export default function CandlesShell({
  kidName,
  kidClassLists,
  currentTier,
  highestTier,
}: {
  kidName?: string;
  kidClassLists?: ClassWordList[];
  currentTier: number;
  highestTier?: number;
}) {
  const skill = useMemo(() => verbalSkillFor('spelling'), []);
  const lists = useMemo(() => kidClassLists ?? [], [kidClassLists]);

  return (
    <WordGameShell
      gameSlug="hangman"
      gameTitle="Cakey's Candles"
      gameGlyph="🎧"
      gameDescription="Cakey says a word. Spell it out, one letter at a time, before the candles blow out!"
      kicker="Cakey's Candles"
      title={(name) => (name ? `${name}'s Candles` : "Cakey's Candles")}
      kidName={kidName}
      kidClassLists={kidClassLists}
      currentTier={currentTier}
      highestTier={highestTier}
      skill={skill}
      levelPreview={(level) => {
        const fromClass = classListSuffices('spelling', {}, lists);
        const usable = fromClass ? classWordsFor('spelling', {}, lists).words.length : 0;
        const candles = maxMissesForTier(level);
        return (
          <div className="mt-3 rounded-xl bg-white/80 px-4 py-3 text-center text-sm dark:bg-zinc-900/80">
            <div className="font-semibold text-stone-700 dark:text-stone-200">
              🕯️ {candles} candles per word{revealsVowels(level) ? ' · vowels shown to start' : ''} ·{' '}
              {Math.min(usable || WORDS_PER_ROUND, WORDS_PER_ROUND)} words a round
            </div>
            <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              {fromClass
                ? `📝 From your word list — ${usable} spelling word${usable === 1 ? '' : 's'} to hear.`
                : lists.length > 0
                  ? 'Your word list needs three spelling words to play here, so this level uses the Gamecakes library.'
                  : 'Words from the Gamecakes library. A grown-up can add your spelling list on the parent page.'}
            </div>
          </div>
        );
      }}
      renderGame={(level, onComplete) => <CandlesGame level={level} onComplete={onComplete} />}
      gameOver={(s) => {
        const solved = s.optimal_taps - s.taps_wrong;
        return {
          emoji: s.efficiency >= 0.9 ? '🏆' : s.efficiency >= 0.6 ? '🎂' : '🙂',
          headline: s.efficiency >= 0.9 ? 'Every word!' : s.efficiency >= 0.6 ? 'Great spelling!' : 'Good listening!',
          line: s.meta_lines?.[0] ?? `${solved} of ${s.optimal_taps} words`,
        };
      }}
    />
  );
}
