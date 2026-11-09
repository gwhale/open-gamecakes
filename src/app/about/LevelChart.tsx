// The /about chart: what Cakey suggests at each grade, and who can change it.
//
// The goals and word prompts are read from the code that serves them, so they
// cannot drift from the game: GRADE_PLANS is what the launcher suggests, and
// READING_CONTENT is the question a kid at that level is asked. Math questions are
// generated at random, so those samples are written here. Each one must stay inside
// what generateMathChallenge() produces at its grade's tier.
//
// The wording below is a promise to parents, so it follows the code:
//   - The goal is a suggestion and a new player's is capped (cakeyRecommends), so it
//     is called a goal, never a starting level.
//   - A grown-up's topic and level change the suggestion and lock nothing (FocusCard),
//     so the page says kids can still choose something else.

import { GRADE_PLANS } from '@/lib/games/shared/recommend';
import type { ReadingChallengeType } from '@/lib/games/shared/generate-reading-challenge';
import { READING_CONTENT, clampToAvailableTier } from '@/lib/games/shared/reading-content';

const GRADES = [
  { grade: 0, label: 'K', mathSample: '5 + 4' },
  { grade: 1, label: '1st', mathSample: '15 − 4' },
  { grade: 2, label: '2nd', mathSample: '33 + 44' },
  { grade: 3, label: '3rd', mathSample: '8 × 7' },
  { grade: 4, label: '4th', mathSample: '84 ÷ 3' },
  { grade: 5, label: '5th', mathSample: '478 × 5' },
];

const LEVELS = Array.from({ length: 10 }, (_, i) => i + 1);

const ON_ITS_OWN = [
  'Their grade moves up every August.',
  'After 10 or more rounds at a level, doing well moves it up and struggling moves it down.',
];

const YOURS = [
  'Their grade, any time.',
  'A math or word topic and level, like times tables before a quiz.',
  'The exact level on any skill.',
  "Your school's word list, for spelling, sight words or word meanings.",
];

function wordSample(type: ReadingChallengeType, tier: number): string | null {
  if (type === 'mixed') return null;
  return READING_CONTENT[type][clampToAvailableTier(type, tier)]?.[0]?.prompt ?? null;
}

function LevelBar({ level }: { level: number }): React.ReactElement {
  return (
    <div className="mt-2">
      <div className="flex gap-0.5" aria-hidden="true">
        {LEVELS.map((n) => (
          <span
            key={n}
            className={`h-2 flex-1 rounded-[2px] ${n <= level ? 'bg-[#9f1d48]' : 'bg-[#e8dac3]'}`}
          />
        ))}
      </div>
      <p className="mt-1 text-sm font-semibold">Level {level} of 10</p>
    </div>
  );
}

function ControlList({ title, items }: { title: string; items: string[] }): React.ReactElement {
  return (
    <div>
      <h3 className="font-display text-xl font-bold">{title}</h3>
      <ul className="mt-2 list-disc space-y-1.5 pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default function LevelChart(): React.ReactElement {
  return (
    <section>
      <h2 className="font-display text-2xl font-bold">Set to their grade. Steered by you.</h2>
      <p className="mt-1 text-lg">
        Cakey suggests what each grade is working on. Play moves the level from there, and a
        grown-up can change it.
      </p>

      <div className="mt-4 rounded-md bg-[#fffdf8] p-3 shadow-[0_12px_22px_-8px_rgba(60,30,10,0.55)] sm:p-5">
        <table className="w-full table-fixed border-collapse text-left text-sm sm:text-base">
          <caption className="sr-only">
            What Cakey suggests in math and words at each grade, with a sample question for each.
          </caption>
          <colgroup>
            <col className="w-14 sm:w-16" />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr className="border-b-2 border-[#8a5a33] font-display text-base sm:text-lg">
              <th scope="col" className="pb-2 pr-1 font-bold">Grade</th>
              <th scope="col" className="px-2 pb-2 font-bold sm:px-3">Math goal</th>
              <th scope="col" className="pb-2 pl-2 font-bold sm:pl-3">Words goal</th>
            </tr>
          </thead>
          <tbody>
            {GRADES.map(({ grade, label, mathSample }) => {
              const plan = GRADE_PLANS[grade];
              return (
                <tr key={grade} className="border-b border-[#e8dac3] align-top last:border-b-0">
                  <th scope="row" className="py-3 pr-1 font-display text-lg font-bold sm:text-xl">
                    {label}
                  </th>
                  <td className="px-2 py-3 sm:px-3">
                    <p className="font-semibold">{plan.mathHeadline}</p>
                    <p className="mt-0.5">{mathSample}</p>
                    <LevelBar level={plan.tier} />
                  </td>
                  <td className="py-3 pl-2 sm:pl-3">
                    <p className="font-semibold">{plan.readingHeadline}</p>
                    <p className="mt-0.5">{wordSample(plan.readingType, plan.tier)}</p>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3">
        Math goals follow each grade&rsquo;s Common Core focus. A new player may start lower, because
        levels open up with play.
      </p>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <ControlList title="Changes on its own" items={ON_ITS_OWN} />
        <ControlList title="Yours to change" items={YOURS} />
      </div>
      <p className="mt-4">
        Topics and levels change what Cakey suggests. Kids can still choose something else.
      </p>
    </section>
  );
}
