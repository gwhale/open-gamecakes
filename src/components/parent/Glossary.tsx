// What the words in this portal actually mean.
//
// Every term below is one a parent will meet within a minute of arriving and
// cannot guess: they are precise, internal, and mostly not what the everyday
// word suggests. "Accuracy" is the dangerous one — it is not recorded at all,
// and a parent will assume the percentages are it unless told otherwise.
//
// Collapsed by default so it never nags someone who already knows.

const TERMS: { term: string; meaning: string }[] = [
  {
    term: 'Round',
    meaning:
      'One play of a game, start to finish — not one question. All the counts in this portal are rounds.',
  },
  {
    term: 'Tier',
    meaning:
      'Difficulty within a skill, 1 to 10. The number on its own means little; what matters is how it compares to the grade-level tier.',
  },
  {
    term: 'Grade level',
    meaning:
      'The tier expected for that skill at that school grade. "2 tiers above grade level" means the child is working two steps harder than expected.',
  },
  {
    term: 'Mastery',
    meaning:
      'How reliably the child is clearing their current tier recently. It resets its focus as they move up, so it is about now, not all-time.',
  },
  {
    term: 'Efficiency',
    meaning:
      'Correct taps divided by the taps a perfect round would take. It is a measure of how cleanly a round went.',
  },
  {
    term: 'Finished',
    meaning:
      'The share of rounds played to the end rather than abandoned. A low number usually means a game is too hard or too long, not that the child gave up.',
  },
  {
    term: 'Accuracy',
    meaning:
      'Deliberately absent. Gamecakes does not record right/wrong per question, so nothing here is a per-question accuracy — if you see a percentage, it is rounds or efficiency.',
  },
  {
    term: 'Sugar Tokens',
    meaning:
      'The in-game currency, earned by playing and spent on lands, games, rides and cupcake decorations. They do not affect learning progress.',
  },
];

export default function Glossary(): React.ReactElement {
  return (
    <details className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <summary className="cursor-pointer px-5 py-3.5 text-sm font-bold text-zinc-700 dark:text-zinc-200">
        What do these words mean?
      </summary>
      <dl className="border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
        {TERMS.map((t) => (
          <div key={t.term} className="mb-3 last:mb-0">
            <dt className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{t.term}</dt>
            <dd className="mt-0.5 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              {t.meaning}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
