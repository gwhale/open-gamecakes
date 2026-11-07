// Cakey trivia — Brain Quest-style grade-calibrated trivia bank.
//
// Each question is tagged with:
//   - grade: integer 0..6 where 0=K, 1=1st, ..., 6=6th. The "target"
//     grade where a typical kid finds the question fun-but-doable.
//   - category: rough subject area, currently informational (could
//     drive future filtering).
//
// pickQuestion(kidGrade) returns a question from the [kidGrade-1,
// kidGrade+1] window, so the kid sees a mix of "easy review" and
// "stretch" content but never something far above or below them.
// kidGrade=null falls back to a default mid-range so unknown-grade
// kids (e.g. the Guest sandbox) get reasonable variety.
//
// This dataset is intentionally small for v1 — the calibration system
// matters more than the content volume. Future PRs add more questions
// per grade; the data shape is stable.

export type TriviaCategory =
  | 'animals'
  | 'space'
  | 'body'
  | 'food'
  | 'numbers'
  | 'shapes'
  | 'reading'
  | 'geography'
  | 'weather'
  | 'history'
  | 'science';

export interface TriviaQuestion {
  q: string;
  choices: [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
  funFact: string;
  /** Target grade level: 0=K, 1=1st, ..., 6=6th. */
  grade: number;
  category: TriviaCategory;
}

/** Default grade window when the kid's grade is unknown — middle of K-6. */
const DEFAULT_GRADE = 2;
/** Window radius around the target grade. ±1 keeps the spread tight. */
const GRADE_WINDOW = 1;

export const TRIVIA_QUESTIONS: readonly TriviaQuestion[] = [
  // ---------------------------------------------------------------------
  // Kindergarten (grade 0)
  // ---------------------------------------------------------------------
  {
    q: 'What do you call a baby frog?',
    choices: ['Cub', 'Tadpole', 'Pup', 'Chick'],
    answer: 1,
    funFact: 'Tadpoles grow legs and become frogs — like magic! 🐸',
    grade: 0,
    category: 'animals',
  },
  {
    q: 'What color is a ripe banana?',
    choices: ['Red', 'Green', 'Blue', 'Yellow'],
    answer: 3,
    funFact: 'Bananas start green and ripen to yellow! 🍌',
    grade: 0,
    category: 'food',
  },
  {
    q: 'What do you call a 3-sided shape?',
    choices: ['Square', 'Pentagon', 'Triangle', 'Hexagon'],
    answer: 2,
    funFact: 'Tri means three — triangle, tricycle, tripod! 🔺',
    grade: 0,
    category: 'shapes',
  },
  {
    q: 'How many days are in a week?',
    choices: ['5', '6', '7', '10'],
    answer: 2,
    funFact: 'Mon, Tues, Wed, Thurs, Fri, Sat, Sun — seven days! 📅',
    grade: 0,
    category: 'numbers',
  },
  {
    q: 'What season comes after winter?',
    choices: ['Summer', 'Fall', 'Spring', 'Winter again'],
    answer: 2,
    funFact: 'Winter → Spring → Summer → Fall → repeat! 🌱',
    grade: 0,
    category: 'weather',
  },
  {
    q: 'What letter does the word "apple" start with?',
    choices: ['A', 'P', 'L', 'E'],
    answer: 0,
    funFact: 'Apple, ant, astronaut — all start with A! 🍎',
    grade: 0,
    category: 'reading',
  },

  // ---------------------------------------------------------------------
  // 1st grade
  // ---------------------------------------------------------------------
  {
    q: 'How many legs does a spider have?',
    choices: ['4', '6', '8', '10'],
    answer: 2,
    funFact: 'Spiders have 8 legs — two more than insects! 🕷️',
    grade: 1,
    category: 'animals',
  },
  {
    q: 'Which animal is the fastest on land?',
    choices: ['Lion', 'Horse', 'Cheetah', 'Ostrich'],
    answer: 2,
    funFact: 'Cheetahs can run as fast as a car on the highway! 🐆',
    grade: 1,
    category: 'animals',
  },
  {
    q: 'What do caterpillars turn into?',
    choices: ['Spiders', 'Fireflies', 'Butterflies', 'Bees'],
    answer: 2,
    funFact: 'They wrap up in a cocoon and totally transform! 🦋',
    grade: 1,
    category: 'animals',
  },
  {
    q: 'How many colors are in a rainbow?',
    choices: ['5', '6', '7', '8'],
    answer: 2,
    funFact: 'ROY G BIV — Red, Orange, Yellow, Green, Blue, Indigo, Violet! 🌈',
    grade: 1,
    category: 'science',
  },
  {
    q: 'What do bees make?',
    choices: ['Silk', 'Honey', 'Milk', 'Wax candles'],
    answer: 1,
    funFact: 'A single bee makes about 1/12 of a teaspoon of honey in its life! 🐝',
    grade: 1,
    category: 'animals',
  },
  {
    q: 'How many minutes are in an hour?',
    choices: ['30', '50', '60', '100'],
    answer: 2,
    funFact: '60 minutes — same as 60 seconds in a minute! ⏰',
    grade: 1,
    category: 'numbers',
  },
  {
    q: 'Where do strawberries grow?',
    choices: ['Underground', 'In tall trees', 'Low vines near the ground', 'In the ocean'],
    answer: 2,
    funFact: 'Strawberry plants are low to the ground with little runners! 🍓',
    grade: 1,
    category: 'food',
  },

  // ---------------------------------------------------------------------
  // 2nd grade
  // ---------------------------------------------------------------------
  {
    q: 'How many planets are in our solar system?',
    choices: ['7', '8', '9', '10'],
    answer: 1,
    funFact: 'Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune — 8! 🪐',
    grade: 2,
    category: 'space',
  },
  {
    q: 'How many hearts does an octopus have?',
    choices: ['1', '2', '3', '8'],
    answer: 2,
    funFact: 'Octopuses have 3 hearts AND blue blood! 🐙',
    grade: 2,
    category: 'animals',
  },
  {
    q: 'Which planet has the biggest rings?',
    choices: ['Mars', 'Jupiter', 'Saturn', 'Neptune'],
    answer: 2,
    funFact: "Saturn's rings are made of billions of ice chunks and rocks! 🪐",
    grade: 2,
    category: 'space',
  },
  {
    q: 'How many sides does a hexagon have?',
    choices: ['5', '6', '7', '8'],
    answer: 1,
    funFact: 'Hex means six! Honeybees build hexagon cells in their hives. 🐝',
    grade: 2,
    category: 'shapes',
  },
  {
    q: 'What gas do plants give off into the air?',
    choices: ['Carbon dioxide', 'Nitrogen', 'Oxygen', 'Helium'],
    answer: 2,
    funFact: 'Plants breathe IN carbon dioxide and breathe OUT oxygen — the opposite of us! 🌳',
    grade: 2,
    category: 'science',
  },
  {
    q: 'How many continents are there?',
    choices: ['5', '6', '7', '9'],
    answer: 2,
    funFact: 'Africa, Antarctica, Asia, Australia, Europe, North America, South America! 🌍',
    grade: 2,
    category: 'geography',
  },
  {
    q: 'Which bird can fly backwards?',
    choices: ['Eagle', 'Parrot', 'Hummingbird', 'Penguin'],
    answer: 2,
    funFact: 'Hummingbirds are the only birds that can fly backwards! 🐦',
    grade: 2,
    category: 'animals',
  },

  // ---------------------------------------------------------------------
  // 3rd grade
  // ---------------------------------------------------------------------
  {
    q: 'What is the largest ocean on Earth?',
    choices: ['Atlantic', 'Indian', 'Arctic', 'Pacific'],
    answer: 3,
    funFact: 'The Pacific covers about a third of the entire planet! 🌊',
    grade: 3,
    category: 'geography',
  },
  {
    q: 'What is 12 × 12?',
    choices: ['100', '124', '144', '156'],
    answer: 2,
    funFact: '144 is also called a "gross" — 12 dozen! 🔢',
    grade: 3,
    category: 'numbers',
  },
  {
    q: 'What is water turning into ice called?',
    choices: ['Boiling', 'Melting', 'Freezing', 'Evaporating'],
    answer: 2,
    funFact: 'Water freezes at 32°F (0°C) — that\'s when it turns solid! 🧊',
    grade: 3,
    category: 'science',
  },
  {
    q: 'Who was the first U.S. president?',
    choices: ['Abraham Lincoln', 'George Washington', 'Thomas Jefferson', 'John Adams'],
    answer: 1,
    funFact: 'Washington was sworn in on April 30, 1789 — over 235 years ago! 🇺🇸',
    grade: 3,
    category: 'history',
  },
  {
    q: 'How many bones does an adult human have?',
    choices: ['106', '156', '206', '306'],
    answer: 2,
    funFact: 'Babies are born with about 300 bones — many fuse together as they grow! 🦴',
    grade: 3,
    category: 'body',
  },
  {
    q: 'What is the capital of the United States?',
    choices: ['New York', 'Los Angeles', 'Washington, D.C.', 'Chicago'],
    answer: 2,
    funFact: 'D.C. stands for District of Columbia — and it\'s not part of any state! 🏛️',
    grade: 3,
    category: 'geography',
  },

  // ---------------------------------------------------------------------
  // 4th grade
  // ---------------------------------------------------------------------
  {
    q: 'What is the chemical symbol for water?',
    choices: ['CO2', 'O2', 'H2O', 'NaCl'],
    answer: 2,
    funFact: 'Two hydrogen atoms + one oxygen atom = water! 💧',
    grade: 4,
    category: 'science',
  },
  {
    q: 'Who wrote "Romeo and Juliet"?',
    choices: ['Mark Twain', 'William Shakespeare', 'Charles Dickens', 'Roald Dahl'],
    answer: 1,
    funFact: 'Shakespeare wrote 39 plays and 154 sonnets in the 1500s! 🎭',
    grade: 4,
    category: 'reading',
  },
  {
    q: 'What is the largest desert on Earth?',
    choices: ['Sahara', 'Gobi', 'Antarctica', 'Mojave'],
    answer: 2,
    funFact: 'Antarctica is technically a desert because it gets so little rain! 🐧',
    grade: 4,
    category: 'geography',
  },
  {
    q: 'How many U.S. states are there?',
    choices: ['48', '49', '50', '52'],
    answer: 2,
    funFact: 'Hawaii was the last state added — in 1959! 🌺',
    grade: 4,
    category: 'geography',
  },
  {
    q: 'What is the smallest prime number?',
    choices: ['0', '1', '2', '3'],
    answer: 2,
    funFact: '2 is the only EVEN prime number — every other prime is odd! ➗',
    grade: 4,
    category: 'numbers',
  },

  // ---------------------------------------------------------------------
  // 5th grade
  // ---------------------------------------------------------------------
  {
    q: 'What is the largest organ in the human body?',
    choices: ['Brain', 'Liver', 'Heart', 'Skin'],
    answer: 3,
    funFact: 'Skin can weigh up to 8 pounds and covers about 22 square feet! 🧴',
    grade: 5,
    category: 'body',
  },
  {
    q: 'Approximately how long does light take to reach Earth from the Sun?',
    choices: ['8 seconds', '8 minutes', '8 hours', '8 days'],
    answer: 1,
    funFact: 'Sunlight you see is actually 8 minutes "old"! ☀️',
    grade: 5,
    category: 'space',
  },
  {
    q: 'Which ancient wonder is still standing today?',
    choices: ['Hanging Gardens', 'Lighthouse of Alexandria', 'Great Pyramid of Giza', 'Colossus of Rhodes'],
    answer: 2,
    funFact: 'The Great Pyramid is about 4,500 years old! 🏛️',
    grade: 5,
    category: 'history',
  },
  {
    q: 'What is the longest river in the world?',
    choices: ['Amazon', 'Nile', 'Mississippi', 'Yangtze'],
    answer: 1,
    funFact: 'The Nile flows north for over 4,100 miles through Africa! 🌍',
    grade: 5,
    category: 'geography',
  },
];

/** Pick a grade-calibrated question, optionally avoiding the last one shown.
 *
 *  @param kidGrade — the kid's grade (0=K, 1=1st, ..., 6=6th). Pass null
 *  if unknown; the picker falls back to a sensible mid-range default.
 *  Typically derived via `inferKidGrade()` (median grade of skills the
 *  kid is proficient at) — the trivia stays in sync with the mastery
 *  engine without parent maintenance.
 *  @param excludeIndex — the global index of the previously-shown question;
 *  the picker tries not to show the same one twice in a row.
 *
 *  Phase 2 (future): track per-question correctness in a small
 *  localStorage log + adjust the window dynamically — if the kid's
 *  hit rate at their current grade is >85% we expand upward (try
 *  harder), <40% we contract downward (back off). For now the
 *  performance signal comes from games/homework only via inferKidGrade. */
export function pickQuestion(
  kidGrade: number | null,
  excludeIndex = -1,
): { question: TriviaQuestion; index: number } {
  const target = kidGrade ?? DEFAULT_GRADE;
  const lo = Math.max(0, target - GRADE_WINDOW);
  const hi = Math.min(12, target + GRADE_WINDOW);

  const eligible = TRIVIA_QUESTIONS
    .map((q, idx) => ({ q, idx }))
    .filter(({ q }) => q.grade >= lo && q.grade <= hi);

  // Defensive fallback: if a grade has no questions yet (e.g., 6th
  // before we've added 6th content), widen to the full bank rather than
  // throw. Better to show ANY question than no question.
  const pool = eligible.length > 0
    ? eligible
    : TRIVIA_QUESTIONS.map((q, idx) => ({ q, idx }));

  let pick = pool[Math.floor(Math.random() * pool.length)];
  if (pool.length > 1 && pick.idx === excludeIndex) {
    pick = pool[(pool.indexOf(pick) + 1) % pool.length];
  }
  return { question: pick.q, index: pick.idx };
}
