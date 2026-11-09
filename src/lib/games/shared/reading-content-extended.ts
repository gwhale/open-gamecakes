/**
 * Extended reading content — the nine challenge types added 2026-07-26 to
 * close the standards gap.
 *
 * WHY A SECOND FILE: `reading-content.ts` holds the original five types and is
 * already long. These nine are additive and are spread into the same
 * `READING_CONTENT` record there, so consumers see one flat index. Splitting
 * keeps each file reviewable; it is not a behavioural boundary.
 *
 * WHAT THIS BUYS: before this file, the library reached 6 of the 16 reading
 * skills that `skills.gamifiable = true` in the database. These nine types
 * reach the other 10 — every gamifiable reading standard is now playable.
 *
 * ┌──────────────────┬───────────────────────────┬────────────────────┬─────┐
 * │ type             │ skills row (name/slug)    │ standard_code      │ grd │
 * ├──────────────────┼───────────────────────────┼────────────────────┼─────┤
 * │ letter-sounds    │ letter-sounds             │ RF.K.3             │ K   │
 * │ syllables        │ phonological-awareness    │ RF.K.2             │ K   │
 * │ comprehension    │ simple-comprehension  t1-3│ RL.K.1, RL.1.1     │ K-1 │
 * │                  │ reading-comprehension t4-5│ RL.2.1, RL.2.3     │ 2   │
 * │ punctuation      │ capitalization-punctuation│ L.K.2, L.1.2, L.2.2│ K-2 │
 * │ parts-of-speech  │ parts-of-speech           │ L.1.1, L.2.1, L.3.1│ 1-3 │
 * │ word-building    │ multisyllabic-words       │ RF.2.3.C, RF.3.3.C │ 2-3 │
 * │ spelling         │ spelling-patterns         │ L.2.2.D, L.3.2.E   │ 2-4 │
 * │ figurative       │ figurative-language       │ L.4.5, L.5.5       │ 4-5 │
 * │ word-roots       │ greek-latin-roots         │ L.4.4.B, L.5.4.B   │ 4-6 │
 * └──────────────────┴───────────────────────────┴────────────────────┴─────┘
 * The mapping itself lives in `verbalSkillFor()` in challenge-mode.ts — this
 * table is documentation, not the source of truth.
 *
 * ⚠️ AUTHORING RULE: `generate-reading-challenge.ts` strips any choice equal to
 * the LAST ALL-CAPS TOKEN in the prompt (an anti-giveaway guard). So a prompt
 * may contain at most one all-caps word, and it must be the word the question
 * is about. Never write an incidental capital (or a bare "I") into a prompt or
 * a distractor will silently disappear.
 *
 * Tiers run 1..5 = difficulty inside the type, NOT grade level. Ten items per
 * tier; the generator picks one at random, so a round rarely repeats.
 */

import type { ReadingContentItem } from './reading-content';

export type ExtendedReadingType =
  | 'letter-sounds'
  | 'syllables'
  | 'comprehension'
  | 'punctuation'
  | 'parts-of-speech'
  | 'word-building'
  | 'spelling'
  | 'figurative'
  | 'word-roots'
  | 'word-meaning';

export const EXTENDED_READING_CONTENT: Record<
  ExtendedReadingType,
  Record<number, ReadingContentItem[]>
> = {
  // ==========================================================================
  // LETTER SOUNDS — phoneme→grapheme (RF.K.3). Slashes mark a sound, not a
  // letter name: /b/ is "buh", not "bee". Kept out of all-caps so the
  // anti-giveaway guard ignores them.
  // ==========================================================================
  'letter-sounds': {
    // t1 — initial consonants
    1: [
      { prompt: 'Which word starts with /b/?', answer: 'bat',  choices: ['bat', 'cat', 'hat'] },
      { prompt: 'Which word starts with /m/?', answer: 'mop',  choices: ['mop', 'top', 'pop'] },
      { prompt: 'Which word starts with /s/?', answer: 'sun',  choices: ['sun', 'run', 'fun'] },
      { prompt: 'Which word starts with /d/?', answer: 'dog',  choices: ['dog', 'log', 'fog'] },
      { prompt: 'Which word starts with /p/?', answer: 'pig',  choices: ['pig', 'big', 'dig'] },
      { prompt: 'Which word starts with /t/?', answer: 'ten',  choices: ['ten', 'hen', 'pen'] },
      { prompt: 'Which word starts with /f/?', answer: 'fan',  choices: ['fan', 'can', 'man'] },
      { prompt: 'Which word starts with /l/?', answer: 'leg',  choices: ['leg', 'beg', 'egg'] },
      { prompt: 'Which word starts with /r/?', answer: 'rug',  choices: ['rug', 'bug', 'hug'] },
      { prompt: 'Which word starts with /k/?', answer: 'cake', choices: ['cake', 'lake', 'rake'] },
    ],
    // t2 — final consonants
    2: [
      { prompt: 'Which word ends with /t/?', answer: 'cat',  choices: ['cat', 'can', 'cap'] },
      { prompt: 'Which word ends with /g/?', answer: 'bag',  choices: ['bag', 'bad', 'bat'] },
      { prompt: 'Which word ends with /p/?', answer: 'cup',  choices: ['cup', 'cut', 'cub'] },
      { prompt: 'Which word ends with /n/?', answer: 'sun',  choices: ['sun', 'sub', 'sum'] },
      { prompt: 'Which word ends with /d/?', answer: 'bed',  choices: ['bed', 'bet', 'beg'] },
      { prompt: 'Which word ends with /m/?', answer: 'ham',  choices: ['ham', 'hat', 'had'] },
      { prompt: 'Which word ends with /k/?', answer: 'duck', choices: ['duck', 'dug', 'dust'] },
      { prompt: 'Which word ends with /s/?', answer: 'bus',  choices: ['bus', 'but', 'bun'] },
      { prompt: 'Which word ends with /l/?', answer: 'ball', choices: ['ball', 'bark', 'barn'] },
      { prompt: 'Which word ends with /f/?', answer: 'leaf', choices: ['leaf', 'lean', 'leap'] },
    ],
    // t3 — short vowels in the middle
    3: [
      { prompt: 'Which word has the short /a/ sound?', answer: 'map',  choices: ['map', 'mop', 'mip'] },
      { prompt: 'Which word has the short /e/ sound?', answer: 'net',  choices: ['net', 'nut', 'note'] },
      { prompt: 'Which word has the short /i/ sound?', answer: 'pin',  choices: ['pin', 'pan', 'pine'] },
      { prompt: 'Which word has the short /o/ sound?', answer: 'hop',  choices: ['hop', 'hip', 'hope'] },
      { prompt: 'Which word has the short /u/ sound?', answer: 'cub',  choices: ['cub', 'cab', 'cube'] },
      { prompt: 'Which word has the short /a/ sound?', answer: 'hand', choices: ['hand', 'hind', 'hound'] },
      { prompt: 'Which word has the short /e/ sound?', answer: 'desk', choices: ['desk', 'disk', 'dusk'] },
      { prompt: 'Which word has the short /i/ sound?', answer: 'fish', choices: ['fish', 'fash', 'fush'] },
      { prompt: 'Which word has the short /o/ sound?', answer: 'sock', choices: ['sock', 'sick', 'suck'] },
      { prompt: 'Which word has the short /u/ sound?', answer: 'jump', choices: ['jump', 'jamp', 'jimp'] },
    ],
    // t4 — digraphs
    4: [
      { prompt: 'Which word starts with the /sh/ sound?', answer: 'ship',  choices: ['ship', 'sip', 'skip'] },
      { prompt: 'Which word starts with the /ch/ sound?', answer: 'chin',  choices: ['chin', 'shin', 'thin'] },
      { prompt: 'Which word starts with the /th/ sound?', answer: 'thumb', choices: ['thumb', 'chum', 'sum'] },
      { prompt: 'Which word starts with the /wh/ sound?', answer: 'whale', choices: ['whale', 'wale', 'tale'] },
      { prompt: 'Which word ends with the /sh/ sound?',   answer: 'brush', choices: ['brush', 'brust', 'brunt'] },
      { prompt: 'Which word ends with the /ch/ sound?',   answer: 'beach', choices: ['beach', 'beast', 'beak'] },
      { prompt: 'Which word ends with the /th/ sound?',   answer: 'tooth', choices: ['tooth', 'toot', 'took'] },
      { prompt: 'Which word has the /ph/ sound for /f/?', answer: 'phone', choices: ['phone', 'pone', 'bone'] },
      { prompt: 'Which word starts with the /kn/ spelling for /n/?', answer: 'knee', choices: ['knee', 'nee', 'knew'] },
      { prompt: 'Which word ends with the /ng/ sound?',   answer: 'ring',  choices: ['ring', 'rink', 'rim'] },
    ],
    // t5 — blends + long vowels
    5: [
      { prompt: 'Which word starts with the /bl/ blend?', answer: 'block', choices: ['block', 'back', 'lock'] },
      { prompt: 'Which word starts with the /st/ blend?', answer: 'stop',  choices: ['stop', 'sop', 'top'] },
      { prompt: 'Which word starts with the /tr/ blend?', answer: 'truck', choices: ['truck', 'tuck', 'ruck'] },
      { prompt: 'Which word starts with the /fl/ blend?', answer: 'flag',  choices: ['flag', 'fag', 'lag'] },
      { prompt: 'Which word starts with the /spr/ blend?', answer: 'spring', choices: ['spring', 'sing', 'sprig'] },
      { prompt: 'Which word has the long /a/ sound?', answer: 'rain',  choices: ['rain', 'ran', 'run'] },
      { prompt: 'Which word has the long /e/ sound?', answer: 'seed',  choices: ['seed', 'sed', 'said'] },
      { prompt: 'Which word has the long /i/ sound?', answer: 'kite',  choices: ['kite', 'kit', 'kid'] },
      { prompt: 'Which word has the long /o/ sound?', answer: 'boat',  choices: ['boat', 'bot', 'but'] },
      { prompt: 'Which word has the long /u/ sound?', answer: 'flute', choices: ['flute', 'flut', 'flat'] },
    ],
  },

  // ==========================================================================
  // SYLLABLES — phonological awareness (RF.K.2): counting, isolating,
  // substituting and deleting sounds. This is EAR work, not eye work.
  // ==========================================================================
  syllables: {
    // t1 — count syllables, 1-2
    1: [
      { prompt: 'How many syllables in CAT?',    answer: '1', choices: ['1', '2', '3'] },
      { prompt: 'How many syllables in RABBIT?', answer: '2', choices: ['1', '2', '3'] },
      { prompt: 'How many syllables in DOG?',    answer: '1', choices: ['1', '2', '3'] },
      { prompt: 'How many syllables in PENCIL?', answer: '2', choices: ['1', '2', '3'] },
      { prompt: 'How many syllables in TRUCK?',  answer: '1', choices: ['1', '2', '3'] },
      { prompt: 'How many syllables in MONKEY?', answer: '2', choices: ['1', '2', '3'] },
      { prompt: 'How many syllables in CAKE?',   answer: '1', choices: ['1', '2', '3'] },
      { prompt: 'How many syllables in TIGER?',  answer: '2', choices: ['1', '2', '3'] },
      { prompt: 'How many syllables in BOOK?',   answer: '1', choices: ['1', '2', '3'] },
      { prompt: 'How many syllables in APPLE?',  answer: '2', choices: ['1', '2', '3'] },
    ],
    // t2 — count syllables, 2-4
    2: [
      { prompt: 'How many syllables in BANANA?',    answer: '3', choices: ['2', '3', '4'] },
      { prompt: 'How many syllables in ELEPHANT?',  answer: '3', choices: ['2', '3', '4'] },
      { prompt: 'How many syllables in BUTTERFLY?', answer: '3', choices: ['2', '3', '4'] },
      { prompt: 'How many syllables in COMPUTER?',  answer: '3', choices: ['2', '3', '4'] },
      { prompt: 'How many syllables in ALLIGATOR?', answer: '4', choices: ['3', '4', '5'] },
      { prompt: 'How many syllables in WATERMELON?', answer: '4', choices: ['3', '4', '5'] },
      { prompt: 'How many syllables in DINOSAUR?',  answer: '3', choices: ['2', '3', '4'] },
      { prompt: 'How many syllables in HELICOPTER?', answer: '4', choices: ['3', '4', '5'] },
      { prompt: 'How many syllables in UMBRELLA?',  answer: '3', choices: ['2', '3', '4'] },
      { prompt: 'How many syllables in CATERPILLAR?', answer: '4', choices: ['3', '4', '5'] },
    ],
    // t3 — sound isolation
    3: [
      { prompt: 'What sound does SUN start with?',  answer: '/s/', choices: ['/s/', '/n/', '/u/'] },
      { prompt: 'What sound does FISH end with?',   answer: '/sh/', choices: ['/sh/', '/f/', '/i/'] },
      { prompt: 'What sound is in the middle of CAT?', answer: '/a/', choices: ['/a/', '/k/', '/t/'] },
      { prompt: 'What sound does MOON start with?', answer: '/m/', choices: ['/m/', '/n/', '/oo/'] },
      { prompt: 'What sound does BALL end with?',   answer: '/l/', choices: ['/l/', '/b/', '/a/'] },
      { prompt: 'What sound is in the middle of DOG?', answer: '/o/', choices: ['/o/', '/d/', '/g/'] },
      { prompt: 'What sound does TRAIN start with?', answer: '/t/', choices: ['/t/', '/r/', '/n/'] },
      { prompt: 'What sound does JUMP end with?',   answer: '/p/', choices: ['/p/', '/j/', '/m/'] },
      { prompt: 'What sound is in the middle of BUS?', answer: '/u/', choices: ['/u/', '/b/', '/s/'] },
      { prompt: 'What sound does CHAIR start with?', answer: '/ch/', choices: ['/ch/', '/k/', '/sh/'] },
    ],
    // t4 — onset substitution
    4: [
      { prompt: 'Change the first sound in CAT to /h/. What word?',  answer: 'hat',  choices: ['hat', 'hit', 'cot'] },
      { prompt: 'Change the first sound in MAN to /f/. What word?',  answer: 'fan',  choices: ['fan', 'fun', 'men'] },
      { prompt: 'Change the first sound in PIG to /d/. What word?',  answer: 'dig',  choices: ['dig', 'dog', 'pin'] },
      { prompt: 'Change the first sound in SUN to /f/. What word?',  answer: 'fun',  choices: ['fun', 'fan', 'son'] },
      { prompt: 'Change the last sound in CAT to /p/. What word?',   answer: 'cap',  choices: ['cap', 'cup', 'pat'] },
      { prompt: 'Change the last sound in BUS to /g/. What word?',   answer: 'bug',  choices: ['bug', 'big', 'bun'] },
      { prompt: 'Change the first sound in RAKE to /l/. What word?', answer: 'lake', choices: ['lake', 'like', 'rack'] },
      { prompt: 'Change the middle sound in HAT to /o/. What word?', answer: 'hot',  choices: ['hot', 'hit', 'hut'] },
      { prompt: 'Change the first sound in TALL to /b/. What word?', answer: 'ball', choices: ['ball', 'bell', 'tell'] },
      { prompt: 'Change the last sound in CAKE to /n/. What word?',  answer: 'cane', choices: ['cane', 'cone', 'lake'] },
    ],
    // t5 — phoneme deletion
    5: [
      { prompt: 'Say SMILE without the /s/.',  answer: 'mile',  choices: ['mile', 'sile', 'mild'] },
      { prompt: 'Say STOP without the /s/.',   answer: 'top',   choices: ['top', 'sop', 'tap'] },
      { prompt: 'Say BLOCK without the /b/.',  answer: 'lock',  choices: ['lock', 'block', 'back'] },
      { prompt: 'Say FROG without the /f/.',   answer: 'rog',   choices: ['rog', 'fog', 'frog'] },
      { prompt: 'Say TRAIN without the /t/.',  answer: 'rain',  choices: ['rain', 'train', 'tain'] },
      { prompt: 'Say SPARK without the /s/.',  answer: 'park',  choices: ['park', 'spark', 'sark'] },
      { prompt: 'Say CLAP without the /k/.',   answer: 'lap',   choices: ['lap', 'clap', 'cap'] },
      { prompt: 'Say SNAIL without the /s/.',  answer: 'nail',  choices: ['nail', 'snail', 'sail'] },
      { prompt: 'Say BRUSH without the /b/.',  answer: 'rush',  choices: ['rush', 'brush', 'bush'] },
      { prompt: 'Say PLANT without the /p/.',  answer: 'lant',  choices: ['lant', 'plan', 'pant'] },
    ],
  },

  // ==========================================================================
  // COMPREHENSION — the passage lives in `subtext`, the question in `prompt`.
  // Tiers 1-3 credit `simple-comprehension` (RL.K.1); tiers 4-5 credit
  // `reading-comprehension` (RL.2.1) — see verbalSkillFor().
  // ==========================================================================
  comprehension: {
    // t1 — one sentence, literal who/what
    1: [
      { prompt: 'Who ate the cake?',      subtext: 'The little mouse ate the cake.',            answer: 'the mouse', choices: ['the mouse', 'the cat', 'the dog'] },
      { prompt: 'What color is the hat?', subtext: 'Sam put on his red hat.',                   answer: 'red',       choices: ['red', 'blue', 'green'] },
      { prompt: 'Where is the frog?',     subtext: 'The frog sat on a log.',                    answer: 'on a log',  choices: ['on a log', 'in a pond', 'up a tree'] },
      { prompt: 'What did the dog find?', subtext: 'The dog found a big bone.',                 answer: 'a bone',    choices: ['a bone', 'a ball', 'a stick'] },
      { prompt: 'Who is running?',        subtext: 'Mia is running to the bus.',                answer: 'Mia',       choices: ['Mia', 'the bus', 'the dog'] },
      { prompt: 'What is in the box?',    subtext: 'There are six eggs in the box.',            answer: 'eggs',      choices: ['eggs', 'cake', 'toys'] },
      { prompt: 'Where did the cat sleep?', subtext: 'The cat slept under the bed.',            answer: 'under the bed', choices: ['under the bed', 'on the bed', 'in the box'] },
      { prompt: 'What did Ben drink?',    subtext: 'Ben drank a cup of milk.',                  answer: 'milk',      choices: ['milk', 'juice', 'water'] },
      { prompt: 'How many ducks?',        subtext: 'Three ducks swam in the pond.',             answer: 'three',     choices: ['three', 'two', 'five'] },
      { prompt: 'What is the bird doing?', subtext: 'The bird is building a nest.',             answer: 'building a nest', choices: ['building a nest', 'eating', 'sleeping'] },
    ],
    // t2 — one sentence, simple inference
    2: [
      { prompt: 'How does Rosa feel?',    subtext: 'Rosa smiled and jumped up and down.',       answer: 'happy',   choices: ['happy', 'sad', 'angry'] },
      { prompt: 'What time of day is it?', subtext: 'The stars were out and everyone was asleep.', answer: 'night', choices: ['night', 'morning', 'noon'] },
      { prompt: 'Why did Tom get an umbrella?', subtext: 'Tom looked outside and grabbed his umbrella.', answer: 'it was raining', choices: ['it was raining', 'it was sunny', 'it was snowing'] },
      { prompt: 'Where is Ana?',          subtext: 'Ana filled her cart with apples and bread.', answer: 'a store', choices: ['a store', 'a school', 'a park'] },
      { prompt: 'How does the puppy feel?', subtext: 'The puppy hid under the couch and shook.', answer: 'scared',  choices: ['scared', 'excited', 'sleepy'] },
      { prompt: 'What season is it?',     subtext: 'Leaves crunched under their boots and the air was cold.', answer: 'fall', choices: ['fall', 'summer', 'spring'] },
      { prompt: 'What is Leo doing?',     subtext: 'Leo mixed flour and sugar in a big bowl.',  answer: 'baking',  choices: ['baking', 'painting', 'reading'] },
      { prompt: 'Why is Kim tired?',      subtext: 'Kim ran three races and then walked home.', answer: 'she ran a lot', choices: ['she ran a lot', 'she slept late', 'she is sick'] },
      { prompt: 'Where are they going?',  subtext: 'They packed towels, sunscreen and a bucket.', answer: 'the beach', choices: ['the beach', 'the library', 'the dentist'] },
      { prompt: 'What happened to the plant?', subtext: 'Nobody watered the plant and its leaves turned brown.', answer: 'it dried out', choices: ['it dried out', 'it grew', 'it bloomed'] },
    ],
    // t3 — two sentences, sequence and cause
    3: [
      { prompt: 'What happened first?',   subtext: 'Jack put on his coat. Then he walked to the park.', answer: 'he put on his coat', choices: ['he put on his coat', 'he walked to the park', 'he played'] },
      { prompt: 'Why was the floor wet?', subtext: 'The glass fell off the table. Water spilled everywhere.', answer: 'the glass fell', choices: ['the glass fell', 'it rained', 'the dog shook'] },
      { prompt: 'What will happen next?', subtext: 'Nina blew out the candles. Everyone reached for a plate.', answer: 'they eat cake', choices: ['they eat cake', 'they go home', 'they sing again'] },
      { prompt: 'Why did the class cheer?', subtext: 'The team was losing by one point. Then Sam scored.', answer: 'sam scored', choices: ['sam scored', 'the bell rang', 'it was lunch'] },
      { prompt: 'What is the problem?',   subtext: 'Ravi looked in his bag. His homework was not there.', answer: 'he lost his homework', choices: ['he lost his homework', 'he lost his lunch', 'he missed the bus'] },
      { prompt: 'What did the rain do?',  subtext: 'It rained all night. In the morning the river was very high.', answer: 'made the river rise', choices: ['made the river rise', 'dried the river', 'froze the river'] },
      { prompt: 'Why did Mo take a nap?', subtext: 'Mo stayed up very late. He yawned all through breakfast.', answer: 'he was tired',  choices: ['he was tired', 'he was bored', 'he was sick'] },
      { prompt: 'What happened last?',    subtext: 'The seed sprouted. It grew leaves. Then a flower opened.', answer: 'a flower opened', choices: ['a flower opened', 'the seed sprouted', 'it grew leaves'] },
      { prompt: 'Why did they turn back?', subtext: 'Dark clouds rolled in. The hikers packed up and headed home.', answer: 'a storm was coming', choices: ['a storm was coming', 'they were hungry', 'it got dark'] },
      { prompt: 'What kind of animal is Pip?', subtext: 'Pip flapped hard and rose above the trees. She landed on a branch.', answer: 'a bird', choices: ['a bird', 'a cat', 'a fish'] },
    ],
    // t4 — short passage, character and motive
    4: [
      { prompt: 'Why did Ellie share her lunch?', subtext: 'Ellie saw that Ben had forgotten his lunch again. She quietly slid half her sandwich across the table.', answer: 'to be kind', choices: ['to be kind', 'she was full', 'she disliked it'] },
      { prompt: 'What kind of person is Marco?', subtext: 'Marco stayed after practice every day to help stack the cones, even when nobody asked him to.', answer: 'helpful', choices: ['helpful', 'lazy', 'rude'] },
      { prompt: 'What is the main idea?', subtext: 'Bees move from flower to flower gathering nectar. As they go, pollen sticks to their legs and spreads. Without bees, many plants could not make seeds.', answer: 'bees help plants grow', choices: ['bees help plants grow', 'bees make honey', 'bees can sting'] },
      { prompt: 'Why did Zoe stop reading?', subtext: 'Zoe was on the last chapter when the lights flickered and went out. She sat in the dark, still holding the book.', answer: 'the power went out', choices: ['the power went out', 'she finished it', 'she was bored'] },
      { prompt: 'How did Sam feel at the end?', subtext: 'Sam practised the song for weeks. When he finished playing, the whole room clapped. He grinned all the way home.', answer: 'proud', choices: ['proud', 'embarrassed', 'angry'] },
      { prompt: 'What is the problem in the story?', subtext: 'The bridge to the island washed out in the storm. The ferry was the only way across, and it only ran twice a day.', answer: 'it is hard to cross', choices: ['it is hard to cross', 'the ferry sank', 'there is no island'] },
      { prompt: 'Why did the shop close early?', subtext: 'A sign on the door read: "Back after the parade." Drums echoed from the next street over.', answer: 'for the parade', choices: ['for the parade', 'it was night', 'it was broken'] },
      { prompt: 'What can you tell about Nan?', subtext: 'Nan had fixed the same old radio four times. Her drawer was full of tiny labelled parts.', answer: 'she likes fixing things', choices: ['she likes fixing things', 'she hates music', 'she is careless'] },
      { prompt: 'Why was the garden empty?', subtext: 'Rabbits had slipped under the fence all week. By Friday, not one carrot top was left.', answer: 'rabbits ate it', choices: ['rabbits ate it', 'it was harvested', 'it never grew'] },
      { prompt: 'What lesson does the story teach?', subtext: 'Ari rushed his model and the glue never set. It fell apart on the way to school. The next one he built slowly, and it held.', answer: 'take your time', choices: ['take your time', 'do not build models', 'glue is bad'] },
    ],
    // t5 — passage, inference and author's purpose
    5: [
      { prompt: 'Why did the author write this?', subtext: 'Turn off the tap while you brush. Fix drips quickly. Small habits save thousands of litres a year.', answer: 'to persuade', choices: ['to persuade', 'to entertain', 'to tell a story'] },
      { prompt: 'What does the ending suggest?', subtext: 'Ida locked the shop, then paused. She unlocked it, took one last look at the empty shelves, and turned off the light for good.', answer: 'the shop is closing', choices: ['the shop is closing', 'she forgot something', 'she is opening late'] },
      { prompt: 'What is the theme?', subtext: 'Nobody picked Wren for the team. She practised alone behind the shed all spring. By autumn, she was the one they picked first.', answer: 'hard work pays off', choices: ['hard work pays off', 'teams are unfair', 'sport is easy'] },
      { prompt: 'What is the author comparing?', subtext: 'A city is a body. Roads are its veins, power lines its nerves, and at dawn it wakes and begins to move.', answer: 'a city and a body', choices: ['a city and a body', 'roads and nerves', 'day and night'] },
      { prompt: 'What can you conclude?', subtext: 'Every window on the street was dark except one. Behind it, a shape moved back and forth, back and forth, until sunrise.', answer: 'someone stayed awake', choices: ['someone stayed awake', 'the street was empty', 'the power was out'] },
      { prompt: 'What is the main idea?', subtext: 'Sea otters eat urchins. Urchins eat kelp. Where otters vanished, urchins multiplied and the kelp forests disappeared with them.', answer: 'otters protect kelp', choices: ['otters protect kelp', 'urchins are rare', 'kelp eats otters'] },
      { prompt: 'How does the narrator feel about the move?', subtext: 'They said the new house had more room. It did. It also had none of the marks on the door frame showing how tall I used to be.', answer: 'sad about leaving', choices: ['sad about leaving', 'excited', 'relieved'] },
      { prompt: 'What point is the writer making?', subtext: 'The fastest runner in the race tripped at the halfway mark. The slowest never stopped. Only one of them crossed the line.', answer: 'finishing matters', choices: ['finishing matters', 'speed matters most', 'races are unfair'] },
      { prompt: 'What is the tone of this passage?', subtext: 'Congratulations. You have located the one seat on the entire train with a broken window, in February.', answer: 'sarcastic', choices: ['sarcastic', 'cheerful', 'frightened'] },
      { prompt: 'What does the evidence support?', subtext: 'Layers of ash sit under the village ruins. Tools were left mid-task. Nobody returned to collect them.', answer: 'people left in a hurry', choices: ['people left in a hurry', 'the village grew', 'the tools were stolen'] },
    ],
  },

  // ==========================================================================
  // PUNCTUATION & CAPITALIZATION (L.K.2 → L.2.2). Prompts stay caps-free so
  // the anti-giveaway guard never strips a sentence choice.
  // ==========================================================================
  punctuation: {
    // t1 — end marks
    1: [
      { prompt: 'Which mark ends a telling sentence?', answer: '.', choices: ['.', '?', '!'] },
      { prompt: 'Which mark ends a question?',         answer: '?', choices: ['?', '.', ','] },
      { prompt: 'Which one is right?', subtext: 'How old are you ___', answer: '?', choices: ['?', '.', '!'] },
      { prompt: 'Which one is right?', subtext: 'The dog is asleep ___', answer: '.', choices: ['.', '?', ','] },
      { prompt: 'Which one is right?', subtext: 'Look out ___',          answer: '!', choices: ['!', '.', '?'] },
      { prompt: 'Which one is right?', subtext: 'Where is my shoe ___',  answer: '?', choices: ['?', '.', '!'] },
      { prompt: 'Which one is right?', subtext: 'I like cake ___',       answer: '.', choices: ['.', '?', '!'] },
      { prompt: 'Which mark shows excitement?',        answer: '!', choices: ['!', '.', '?'] },
      { prompt: 'Which one is right?', subtext: 'Can we go now ___',     answer: '?', choices: ['?', '.', '!'] },
      { prompt: 'Which one is right?', subtext: 'My name is Jo ___',     answer: '.', choices: ['.', '?', '!'] },
    ],
    // t2 — first-word capitals and the pronoun i
    2: [
      { prompt: 'Which sentence is written correctly?', answer: 'The cat ran.',   choices: ['The cat ran.', 'the cat ran.', 'the Cat ran.'] },
      { prompt: 'Which sentence is written correctly?', answer: 'I like pie.',    choices: ['I like pie.', 'i like pie.', 'I Like Pie.'] },
      { prompt: 'Which sentence is written correctly?', answer: 'We went home.',  choices: ['We went home.', 'we went home.', 'We Went Home.'] },
      { prompt: 'Which sentence is written correctly?', answer: 'Can I go?',      choices: ['Can I go?', 'can i go?', 'Can i go?'] },
      { prompt: 'Which sentence is written correctly?', answer: 'She is tall.',   choices: ['She is tall.', 'she is tall.', 'She Is Tall.'] },
      { prompt: 'Which sentence is written correctly?', answer: 'My dog barks.',  choices: ['My dog barks.', 'my dog barks.', 'My Dog barks.'] },
      { prompt: 'Which sentence is written correctly?', answer: 'They are here.', choices: ['They are here.', 'they are here.', 'They Are here.'] },
      { prompt: 'Which sentence is written correctly?', answer: 'It is cold.',    choices: ['It is cold.', 'it is cold.', 'It Is cold.'] },
      { prompt: 'Which sentence is written correctly?', answer: 'You and I ran.', choices: ['You and I ran.', 'You and i ran.', 'you and I ran.'] },
      { prompt: 'Which sentence is written correctly?', answer: 'Here it is.',    choices: ['Here it is.', 'here it is.', 'Here It Is.'] },
    ],
    // t3 — proper nouns
    3: [
      { prompt: 'Which sentence is written correctly?', answer: 'We saw Maya today.',    choices: ['We saw Maya today.', 'We saw maya today.', 'we saw Maya Today.'] },
      { prompt: 'Which sentence is written correctly?', answer: 'I live in Boston.',     choices: ['I live in Boston.', 'I live in boston.', 'i live in Boston.'] },
      { prompt: 'Which sentence is written correctly?', answer: 'School starts in September.', choices: ['School starts in September.', 'School starts in september.', 'school starts in September.'] },
      { prompt: 'Which sentence is written correctly?', answer: 'My dog is named Pepper.', choices: ['My dog is named Pepper.', 'My dog is named pepper.', 'my dog is named Pepper.'] },
      { prompt: 'Which sentence is written correctly?', answer: 'We rest on Sunday.',    choices: ['We rest on Sunday.', 'We rest on sunday.', 'we rest on Sunday.'] },
      { prompt: 'Which word needs a capital letter?',   answer: 'texas',  choices: ['texas', 'river', 'mountain'] },
      { prompt: 'Which word needs a capital letter?',   answer: 'monday', choices: ['monday', 'week', 'today'] },
      { prompt: 'Which word needs a capital letter?',   answer: 'anna',   choices: ['anna', 'girl', 'sister'] },
      { prompt: 'Which word does not need a capital?',  answer: 'city',   choices: ['city', 'paris', 'july'] },
      { prompt: 'Which sentence is written correctly?', answer: 'She reads Charlotte on Tuesday.', choices: ['She reads Charlotte on Tuesday.', 'She reads charlotte on tuesday.', 'she reads Charlotte on tuesday.'] },
    ],
    // t4 — commas
    4: [
      { prompt: 'Which sentence is written correctly?', answer: 'I want milk, bread, and eggs.', choices: ['I want milk, bread, and eggs.', 'I want milk bread and eggs.', 'I want, milk bread and eggs.'] },
      { prompt: 'Which sentence is written correctly?', answer: 'We left on May 4, 2026.',   choices: ['We left on May 4, 2026.', 'We left on May 4 2026.', 'We left on May, 4 2026.'] },
      { prompt: 'Which sentence is written correctly?', answer: 'Yes, I can help.',          choices: ['Yes, I can help.', 'Yes I can help.', 'Yes I, can help.'] },
      { prompt: 'Which sentence is written correctly?', answer: 'Sam, please sit down.',     choices: ['Sam, please sit down.', 'Sam please sit down.', 'Sam please, sit down.'] },
      { prompt: 'Which sentence is written correctly?', answer: 'She lives in Reno, Nevada.', choices: ['She lives in Reno, Nevada.', 'She lives in Reno Nevada.', 'She lives, in Reno Nevada.'] },
      { prompt: 'Which sentence is written correctly?', answer: 'After lunch, we swam.',     choices: ['After lunch, we swam.', 'After, lunch we swam.', 'After lunch we, swam.'] },
      { prompt: 'Which sentence is written correctly?', answer: 'I packed a hat, a map, and water.', choices: ['I packed a hat, a map, and water.', 'I packed a hat a map and water.', 'I packed, a hat a map and water.'] },
      { prompt: 'How many commas does this list need?', subtext: 'We saw cows horses and goats.', answer: '2', choices: ['2', '1', '3'] },
      { prompt: 'Which sentence is written correctly?', answer: 'No, that is not mine.',     choices: ['No, that is not mine.', 'No that is not mine.', 'No that, is not mine.'] },
      { prompt: 'Which sentence is written correctly?', answer: 'Before we go, feed the cat.', choices: ['Before we go, feed the cat.', 'Before, we go feed the cat.', 'Before we go feed, the cat.'] },
    ],
    // t5 — apostrophes and quotation marks
    5: [
      { prompt: 'Which sentence is written correctly?', answer: "That is Mia's book.",   choices: ["That is Mia's book.", 'That is Mias book.', "That is Mias' book."] },
      { prompt: 'Which sentence is written correctly?', answer: "We can't go today.",    choices: ["We can't go today.", 'We cant go today.', "We ca'nt go today."] },
      { prompt: 'Which sentence is written correctly?', answer: 'He said, "Come in."',   choices: ['He said, "Come in."', 'He said Come in.', 'He said, Come in".'] },
      { prompt: 'Which sentence is written correctly?', answer: "The dogs' bowls are full.", choices: ["The dogs' bowls are full.", "The dog's bowls are full.", 'The dogs bowls are full.'] },
      { prompt: 'Which sentence is written correctly?', answer: "It's raining again.",   choices: ["It's raining again.", 'Its raining again.', "Its' raining again."] },
      { prompt: 'Which word shows the dog owns it?',    answer: "the dog's tail",  choices: ["the dog's tail", 'the dogs tail', "the dogs' tail"] },
      { prompt: 'Which is the contraction for do not?', answer: "don't",  choices: ["don't", 'dont', "do'nt"] },
      { prompt: 'Which sentence is written correctly?', answer: '"Wait!" she shouted.',  choices: ['"Wait!" she shouted.', 'Wait! she shouted.', '"Wait! she shouted."'] },
      { prompt: 'Which shows the cat belongs to Ben?',  answer: "Ben's cat",  choices: ["Ben's cat", 'Bens cat', "Bens' cat"] },
      { prompt: 'Which sentence is written correctly?', answer: "They're at the park.",  choices: ["They're at the park.", 'Theyre at the park.', "Their'e at the park."] },
    ],
  },

  // ==========================================================================
  // PARTS OF SPEECH (L.1.1 → L.3.1). Kid-facing wording first ("naming word"),
  // graduating to the formal term by tier 3 — the way it is taught.
  // ==========================================================================
  'parts-of-speech': {
    // t1 — naming vs action
    1: [
      { prompt: 'Is DOG a naming word or an action word?',   answer: 'naming', choices: ['naming', 'action'] },
      { prompt: 'Is RUN a naming word or an action word?',   answer: 'action', choices: ['naming', 'action'] },
      { prompt: 'Is CAKE a naming word or an action word?',  answer: 'naming', choices: ['naming', 'action'] },
      { prompt: 'Is JUMP a naming word or an action word?',  answer: 'action', choices: ['naming', 'action'] },
      { prompt: 'Is CHAIR a naming word or an action word?', answer: 'naming', choices: ['naming', 'action'] },
      { prompt: 'Is SING a naming word or an action word?',  answer: 'action', choices: ['naming', 'action'] },
      { prompt: 'Is RIVER a naming word or an action word?', answer: 'naming', choices: ['naming', 'action'] },
      { prompt: 'Is SWIM a naming word or an action word?',  answer: 'action', choices: ['naming', 'action'] },
      { prompt: 'Is TEACHER a naming word or an action word?', answer: 'naming', choices: ['naming', 'action'] },
      { prompt: 'Is CLIMB a naming word or an action word?', answer: 'action', choices: ['naming', 'action'] },
    ],
    // t2 — noun / verb / adjective
    2: [
      { prompt: 'What kind of word is HAPPY?', answer: 'adjective', choices: ['adjective', 'noun', 'verb'] },
      { prompt: 'What kind of word is TABLE?', answer: 'noun',      choices: ['noun', 'verb', 'adjective'] },
      { prompt: 'What kind of word is EAT?',   answer: 'verb',      choices: ['verb', 'noun', 'adjective'] },
      { prompt: 'What kind of word is BLUE?',  answer: 'adjective', choices: ['adjective', 'noun', 'verb'] },
      { prompt: 'What kind of word is SCHOOL?', answer: 'noun',     choices: ['noun', 'verb', 'adjective'] },
      { prompt: 'What kind of word is DANCE?', answer: 'verb',      choices: ['verb', 'noun', 'adjective'] },
      { prompt: 'What kind of word is TINY?',  answer: 'adjective', choices: ['adjective', 'noun', 'verb'] },
      { prompt: 'What kind of word is OCEAN?', answer: 'noun',      choices: ['noun', 'verb', 'adjective'] },
      { prompt: 'What kind of word is BUILD?', answer: 'verb',      choices: ['verb', 'noun', 'adjective'] },
      { prompt: 'What kind of word is LOUD?',  answer: 'adjective', choices: ['adjective', 'noun', 'verb'] },
    ],
    // t3 — adjective vs adverb
    3: [
      { prompt: 'What kind of word is QUICKLY?', answer: 'adverb',    choices: ['adverb', 'adjective', 'noun'] },
      { prompt: 'What kind of word is QUICK?',   answer: 'adjective', choices: ['adjective', 'adverb', 'verb'] },
      { prompt: 'What kind of word is SOFTLY?',  answer: 'adverb',    choices: ['adverb', 'adjective', 'noun'] },
      { prompt: 'Which word describes the verb?', subtext: 'She sang beautifully.', answer: 'beautifully', choices: ['beautifully', 'she', 'sang'] },
      { prompt: 'Which word describes the noun?', subtext: 'The shiny coin fell.',  answer: 'shiny',       choices: ['shiny', 'coin', 'fell'] },
      { prompt: 'What kind of word is BRAVE?',   answer: 'adjective', choices: ['adjective', 'adverb', 'verb'] },
      { prompt: 'What kind of word is SLOWLY?',  answer: 'adverb',    choices: ['adverb', 'adjective', 'noun'] },
      { prompt: 'Which word tells how?', subtext: 'He waited patiently.', answer: 'patiently', choices: ['patiently', 'he', 'waited'] },
      { prompt: 'What kind of word is BRIGHT?',  answer: 'adjective', choices: ['adjective', 'adverb', 'noun'] },
      { prompt: 'Which word tells when?', subtext: 'We left early.',   answer: 'early',  choices: ['early', 'we', 'left'] },
    ],
    // t4 — pronouns and prepositions
    4: [
      { prompt: 'What kind of word is THEY?',   answer: 'pronoun',     choices: ['pronoun', 'noun', 'verb'] },
      { prompt: 'What kind of word is UNDER?',  answer: 'preposition', choices: ['preposition', 'pronoun', 'adverb'] },
      { prompt: 'Which word is a pronoun?', subtext: 'She gave the map to Omar.', answer: 'she', choices: ['she', 'map', 'gave'] },
      { prompt: 'Which word is a preposition?', subtext: 'The cat hid behind the door.', answer: 'behind', choices: ['behind', 'cat', 'hid'] },
      { prompt: 'What kind of word is BETWEEN?', answer: 'preposition', choices: ['preposition', 'pronoun', 'verb'] },
      { prompt: 'What kind of word is OURS?',   answer: 'pronoun',     choices: ['pronoun', 'noun', 'adjective'] },
      { prompt: 'Which pronoun replaces "the girls"?', answer: 'they', choices: ['they', 'it', 'him'] },
      { prompt: 'Which word is a preposition?', subtext: 'We walked across the bridge.', answer: 'across', choices: ['across', 'walked', 'bridge'] },
      { prompt: 'What kind of word is ITSELF?', answer: 'pronoun',     choices: ['pronoun', 'noun', 'adverb'] },
      { prompt: 'Which pronoun replaces "Marco and me"?', answer: 'we', choices: ['we', 'they', 'she'] },
    ],
    // t5 — conjunctions and identification in context
    5: [
      { prompt: 'What kind of word is BECAUSE?', answer: 'conjunction', choices: ['conjunction', 'preposition', 'adverb'] },
      { prompt: 'What kind of word is BUT?',     answer: 'conjunction', choices: ['conjunction', 'pronoun', 'verb'] },
      { prompt: 'Which word joins the two parts?', subtext: 'I ran fast, but I still lost.', answer: 'but', choices: ['but', 'ran', 'still'] },
      { prompt: 'Which word is the verb?', subtext: 'The heavy rain flooded the road.', answer: 'flooded', choices: ['flooded', 'heavy', 'road'] },
      { prompt: 'Which word is the adjective?', subtext: 'A curious fox watched us quietly.', answer: 'curious', choices: ['curious', 'watched', 'quietly'] },
      { prompt: 'Which word is the adverb?', subtext: 'A curious fox watched us quietly.', answer: 'quietly', choices: ['quietly', 'curious', 'fox'] },
      { prompt: 'What kind of word is ALTHOUGH?', answer: 'conjunction', choices: ['conjunction', 'adverb', 'noun'] },
      { prompt: 'Which word is the noun?', subtext: 'They quickly repaired the ancient bridge.', answer: 'bridge', choices: ['bridge', 'quickly', 'repaired'] },
      { prompt: 'Which word is the preposition?', subtext: 'She slid the note under the door.', answer: 'under', choices: ['under', 'slid', 'note'] },
      { prompt: 'Which word is the pronoun?', subtext: 'Nobody told him about the change.', answer: 'him', choices: ['him', 'told', 'change'] },
    ],
  },

  // ==========================================================================
  // WORD BUILDING — multisyllabic decoding (RF.2.3.C). A dot marks the
  // syllable break, which is how these are written on a whiteboard.
  // ==========================================================================
  'word-building': {
    // t1 — compound words
    1: [
      { prompt: 'Split SUNSET into two words.',    answer: 'sun·set',  choices: ['sun·set', 'su·nset', 'suns·et'] },
      { prompt: 'Split BEDROOM into two words.',   answer: 'bed·room', choices: ['bed·room', 'be·droom', 'bedr·oom'] },
      { prompt: 'Split CUPCAKE into two words.',   answer: 'cup·cake', choices: ['cup·cake', 'cu·pcake', 'cupc·ake'] },
      { prompt: 'Split RAINBOW into two words.',   answer: 'rain·bow', choices: ['rain·bow', 'ra·inbow', 'rainb·ow'] },
      { prompt: 'Split BACKPACK into two words.',  answer: 'back·pack', choices: ['back·pack', 'ba·ckpack', 'backp·ack'] },
      { prompt: 'Split SNOWMAN into two words.',   answer: 'snow·man', choices: ['snow·man', 'sno·wman', 'snowm·an'] },
      { prompt: 'Split FOOTBALL into two words.',  answer: 'foot·ball', choices: ['foot·ball', 'fo·otball', 'footb·all'] },
      { prompt: 'Split DOGHOUSE into two words.',  answer: 'dog·house', choices: ['dog·house', 'do·ghouse', 'dogh·ouse'] },
      { prompt: 'Split STARFISH into two words.',  answer: 'star·fish', choices: ['star·fish', 'sta·rfish', 'starf·ish'] },
      { prompt: 'Split PANCAKE into two words.',   answer: 'pan·cake', choices: ['pan·cake', 'pa·ncake', 'panc·ake'] },
    ],
    // t2 — closed-syllable splits between doubles
    2: [
      { prompt: 'Split RABBIT into syllables.',  answer: 'rab·bit',  choices: ['rab·bit', 'ra·bbit', 'rabb·it'] },
      { prompt: 'Split MUFFIN into syllables.',  answer: 'muf·fin',  choices: ['muf·fin', 'mu·ffin', 'muff·in'] },
      { prompt: 'Split BUTTON into syllables.',  answer: 'but·ton',  choices: ['but·ton', 'bu·tton', 'butt·on'] },
      { prompt: 'Split KITTEN into syllables.',  answer: 'kit·ten',  choices: ['kit·ten', 'ki·tten', 'kitt·en'] },
      { prompt: 'Split BASKET into syllables.',  answer: 'bas·ket',  choices: ['bas·ket', 'ba·sket', 'bask·et'] },
      { prompt: 'Split NAPKIN into syllables.',  answer: 'nap·kin',  choices: ['nap·kin', 'na·pkin', 'napk·in'] },
      { prompt: 'Split WINDOW into syllables.',  answer: 'win·dow',  choices: ['win·dow', 'wi·ndow', 'wind·ow'] },
      { prompt: 'Split PUPPET into syllables.',  answer: 'pup·pet',  choices: ['pup·pet', 'pu·ppet', 'pupp·et'] },
      { prompt: 'Split SUMMER into syllables.',  answer: 'sum·mer',  choices: ['sum·mer', 'su·mmer', 'summ·er'] },
      { prompt: 'Split TUNNEL into syllables.',  answer: 'tun·nel',  choices: ['tun·nel', 'tu·nnel', 'tunn·el'] },
    ],
    // t3 — three syllables
    3: [
      { prompt: 'Split BUTTERFLY into syllables.', answer: 'but·ter·fly', choices: ['but·ter·fly', 'butt·erf·ly', 'bu·tterf·ly'] },
      { prompt: 'Split ELEPHANT into syllables.',  answer: 'el·e·phant',  choices: ['el·e·phant', 'ele·ph·ant', 'e·leph·ant'] },
      { prompt: 'Split BANANA into syllables.',    answer: 'ba·nan·a',    choices: ['ba·nan·a', 'ban·an·a', 'b·anan·a'] },
      { prompt: 'Split COMPUTER into syllables.',  answer: 'com·pu·ter',  choices: ['com·pu·ter', 'comp·ut·er', 'co·mput·er'] },
      { prompt: 'Split DINOSAUR into syllables.',  answer: 'di·no·saur',  choices: ['di·no·saur', 'din·os·aur', 'd·inos·aur'] },
      { prompt: 'Split UMBRELLA into syllables.',  answer: 'um·brel·la',  choices: ['um·brel·la', 'umb·rel·la', 'u·mbrell·a'] },
      { prompt: 'Split TOMATO into syllables.',    answer: 'to·ma·to',    choices: ['to·ma·to', 'tom·at·o', 't·omat·o'] },
      { prompt: 'How many syllables in FANTASTIC?', answer: '3', choices: ['3', '2', '4'] },
      { prompt: 'Split HOSPITAL into syllables.',  answer: 'hos·pi·tal',  choices: ['hos·pi·tal', 'ho·spit·al', 'hosp·it·al'] },
      { prompt: 'Split VOLCANO into syllables.',   answer: 'vol·ca·no',   choices: ['vol·ca·no', 'vo·lcan·o', 'volc·an·o'] },
    ],
    // t4 — prefixes and suffixes as syllables
    4: [
      { prompt: 'Split UNHAPPY into syllables.',    answer: 'un·hap·py',   choices: ['un·hap·py', 'unh·ap·py', 'u·nhapp·y'] },
      { prompt: 'Split REPLAYING into syllables.',  answer: 're·play·ing', choices: ['re·play·ing', 'rep·lay·ing', 'r·eplay·ing'] },
      { prompt: 'Split CAREFULLY into syllables.',  answer: 'care·ful·ly', choices: ['care·ful·ly', 'car·eful·ly', 'ca·reful·ly'] },
      { prompt: 'Split DISAGREE into syllables.',   answer: 'dis·a·gree',  choices: ['dis·a·gree', 'di·sag·ree', 'disa·gr·ee'] },
      { prompt: 'What is the prefix in UNLOCK?',    answer: 'un',   choices: ['un', 'lock', 'nlo'] },
      { prompt: 'What is the suffix in HOPEFUL?',   answer: 'ful',  choices: ['ful', 'hope', 'efu'] },
      { prompt: 'What is the base word in REBUILDING?', answer: 'build', choices: ['build', 'rebuild', 'building'] },
      { prompt: 'Split MISTAKEN into syllables.',   answer: 'mis·tak·en',  choices: ['mis·tak·en', 'mi·stak·en', 'mist·ak·en'] },
      { prompt: 'What is the base word in UNKINDLY?', answer: 'kind', choices: ['kind', 'unkind', 'kindly'] },
      { prompt: 'Split PREHEATING into syllables.', answer: 'pre·heat·ing', choices: ['pre·heat·ing', 'preh·eat·ing', 'pr·eheat·ing'] },
    ],
    // t5 — four syllables
    5: [
      { prompt: 'Split ALLIGATOR into syllables.',   answer: 'al·li·ga·tor',   choices: ['al·li·ga·tor', 'all·ig·at·or', 'a·llig·at·or'] },
      { prompt: 'Split WATERMELON into syllables.',  answer: 'wa·ter·mel·on',  choices: ['wa·ter·mel·on', 'wat·erm·el·on', 'w·ater·mel·on'] },
      { prompt: 'Split HELICOPTER into syllables.',  answer: 'hel·i·cop·ter',  choices: ['hel·i·cop·ter', 'he·lic·op·ter', 'heli·co·pt·er'] },
      { prompt: 'Split CATERPILLAR into syllables.', answer: 'cat·er·pil·lar', choices: ['cat·er·pil·lar', 'ca·terp·il·lar', 'cate·rp·ill·ar'] },
      { prompt: 'How many syllables in TELEVISION?', answer: '4', choices: ['4', '3', '5'] },
      { prompt: 'How many syllables in IMPOSSIBLE?', answer: '4', choices: ['4', '3', '5'] },
      { prompt: 'Split CELEBRATION into syllables.', answer: 'cel·e·bra·tion', choices: ['cel·e·bra·tion', 'ce·leb·rat·ion', 'cele·br·ati·on'] },
      { prompt: 'How many syllables in EXPERIMENT?', answer: '4', choices: ['4', '3', '5'] },
      { prompt: 'Split INFORMATION into syllables.', answer: 'in·for·ma·tion', choices: ['in·for·ma·tion', 'inf·orm·at·ion', 'i·nform·ati·on'] },
      { prompt: 'How many syllables in VOCABULARY?', answer: '5', choices: ['5', '4', '3'] },
    ],
  },

  // ==========================================================================
  // SPELLING PATTERNS (L.2.2.D → L.4.2.D). Each tier is one rule, so a miss
  // points at a teachable rule rather than at a memorised word.
  // ==========================================================================
  spelling: {
    // t1 — cvc and simple plurals
    1: [
      { prompt: 'Which spelling is correct?', answer: 'cat',   choices: ['cat', 'kat', 'catt'] },
      { prompt: 'Which spelling is correct?', answer: 'bed',   choices: ['bed', 'bedd', 'bad'] },
      { prompt: 'What is the plural of DOG?', answer: 'dogs',  choices: ['dogs', 'doges', 'dogges'] },
      { prompt: 'What is the plural of CUP?', answer: 'cups',  choices: ['cups', 'cupes', 'cupps'] },
      { prompt: 'Which spelling is correct?', answer: 'jump',  choices: ['jump', 'jumpp', 'gump'] },
      { prompt: 'Which spelling is correct?', answer: 'ship',  choices: ['ship', 'shipp', 'schip'] },
      { prompt: 'What is the plural of HAT?', answer: 'hats',  choices: ['hats', 'hates', 'hatts'] },
      { prompt: 'Which spelling is correct?', answer: 'frog',  choices: ['frog', 'frogg', 'phrog'] },
      { prompt: 'Which spelling is correct?', answer: 'stop',  choices: ['stop', 'stopp', 'sstop'] },
      { prompt: 'What is the plural of BOOK?', answer: 'books', choices: ['books', 'bookes', 'bookks'] },
    ],
    // t2 — silent e
    2: [
      { prompt: 'Which spelling is correct?', answer: 'cake',  choices: ['cake', 'cak', 'caik'] },
      { prompt: 'Which spelling is correct?', answer: 'bike',  choices: ['bike', 'bik', 'byke'] },
      { prompt: 'Add silent e to TAP. What word?',  answer: 'tape', choices: ['tape', 'taap', 'tapp'] },
      { prompt: 'Add silent e to HOP. What word?',  answer: 'hope', choices: ['hope', 'hoop', 'hopp'] },
      { prompt: 'Add silent e to CUB. What word?',  answer: 'cube', choices: ['cube', 'coob', 'cubb'] },
      { prompt: 'Which spelling is correct?', answer: 'nose',  choices: ['nose', 'noze', 'noes'] },
      { prompt: 'Add silent e to PIN. What word?',  answer: 'pine', choices: ['pine', 'peen', 'pinn'] },
      { prompt: 'Which spelling is correct?', answer: 'smile', choices: ['smile', 'smil', 'smyle'] },
      { prompt: 'Add silent e to KIT. What word?',  answer: 'kite', choices: ['kite', 'keet', 'kitt'] },
      { prompt: 'Which spelling is correct?', answer: 'stone', choices: ['stone', 'ston', 'stoan'] },
    ],
    // t3 — doubling before -ing and -ed
    3: [
      { prompt: 'Add -ing to RUN.',   answer: 'running',  choices: ['running', 'runing', 'runnning'] },
      { prompt: 'Add -ing to HOP.',   answer: 'hopping',  choices: ['hopping', 'hoping', 'hopeing'] },
      { prompt: 'Add -ing to JUMP.',  answer: 'jumping',  choices: ['jumping', 'jumpping', 'jumpeing'] },
      { prompt: 'Add -ed to STOP.',   answer: 'stopped',  choices: ['stopped', 'stoped', 'stopedd'] },
      { prompt: 'Add -ing to MAKE.',  answer: 'making',   choices: ['making', 'makeing', 'makking'] },
      { prompt: 'Add -ed to WALK.',   answer: 'walked',   choices: ['walked', 'walkked', 'walkd'] },
      { prompt: 'Add -ing to SIT.',   answer: 'sitting',  choices: ['sitting', 'siting', 'sitteing'] },
      { prompt: 'Add -ed to PLAN.',   answer: 'planned',  choices: ['planned', 'planed', 'planeed'] },
      { prompt: 'Add -ing to WRITE.', answer: 'writing',  choices: ['writing', 'writeing', 'writting'] },
      { prompt: 'Add -ed to HOPE.',   answer: 'hoped',    choices: ['hoped', 'hopped', 'hopeed'] },
    ],
    // t4 — y→i and -es plurals
    4: [
      { prompt: 'What is the plural of BABY?',   answer: 'babies',  choices: ['babies', 'babys', 'babyes'] },
      { prompt: 'What is the plural of BOX?',    answer: 'boxes',   choices: ['boxes', 'boxs', 'boxies'] },
      { prompt: 'What is the plural of BRUSH?',  answer: 'brushes', choices: ['brushes', 'brushs', 'brushies'] },
      { prompt: 'What is the plural of CITY?',   answer: 'cities',  choices: ['cities', 'citys', 'cityes'] },
      { prompt: 'What is the plural of LEAF?',   answer: 'leaves',  choices: ['leaves', 'leafs', 'leafes'] },
      { prompt: 'Add -ed to CARRY.',             answer: 'carried', choices: ['carried', 'carryed', 'carrid'] },
      { prompt: 'What is the plural of BENCH?',  answer: 'benches', choices: ['benches', 'benchs', 'benchies'] },
      { prompt: 'Add -er to HAPPY.',             answer: 'happier', choices: ['happier', 'happyer', 'happyier'] },
      { prompt: 'What is the plural of KEY?',    answer: 'keys',    choices: ['keys', 'kies', 'keyes'] },
      { prompt: 'What is the plural of KNIFE?',  answer: 'knives',  choices: ['knives', 'knifes', 'knifves'] },
    ],
    // t5 — ie/ei, -tion, tricky patterns
    5: [
      { prompt: 'Which spelling is correct?', answer: 'receive',   choices: ['receive', 'recieve', 'receeve'] },
      { prompt: 'Which spelling is correct?', answer: 'believe',   choices: ['believe', 'beleive', 'beleve'] },
      { prompt: 'Which spelling is correct?', answer: 'nation',    choices: ['nation', 'nashun', 'nasion'] },
      { prompt: 'Which spelling is correct?', answer: 'decision',  choices: ['decision', 'decission', 'decistion'] },
      { prompt: 'Which spelling is correct?', answer: 'separate',  choices: ['separate', 'seperate', 'separete'] },
      { prompt: 'Which spelling is correct?', answer: 'necessary', choices: ['necessary', 'neccessary', 'necesary'] },
      { prompt: 'Which spelling is correct?', answer: 'friend',    choices: ['friend', 'freind', 'frend'] },
      { prompt: 'Which spelling is correct?', answer: 'weight',    choices: ['weight', 'wieght', 'wayght'] },
      { prompt: 'Which spelling is correct?', answer: 'because',   choices: ['because', 'becuase', 'becouse'] },
      { prompt: 'Which spelling is correct?', answer: 'different', choices: ['different', 'diffrent', 'differant'] },
    ],
  },

  // ==========================================================================
  // FIGURATIVE LANGUAGE (L.4.5 → L.5.5). One device per tier, then mixed.
  // ==========================================================================
  figurative: {
    // t1 — similes
    1: [
      { prompt: 'What does this mean?', subtext: 'She was as quiet as a mouse.', answer: 'very quiet', choices: ['very quiet', 'very small', 'very fast'] },
      { prompt: 'What does this mean?', subtext: 'He ran like the wind.',        answer: 'very fast',  choices: ['very fast', 'very slow', 'very loud'] },
      { prompt: 'What does this mean?', subtext: 'The pillow was like a cloud.', answer: 'very soft',  choices: ['very soft', 'very white', 'very high'] },
      { prompt: 'Which one is a simile?', answer: 'brave as a lion', choices: ['brave as a lion', 'a brave lion', 'the lion was brave'] },
      { prompt: 'What does this mean?', subtext: 'Her hands were as cold as ice.', answer: 'very cold', choices: ['very cold', 'very wet', 'very smooth'] },
      { prompt: 'Which one is a simile?', answer: 'sleeps like a log', choices: ['sleeps like a log', 'sleeps on a log', 'the log slept'] },
      { prompt: 'What does this mean?', subtext: 'The room was like an oven.',   answer: 'very hot',  choices: ['very hot', 'very clean', 'very dark'] },
      { prompt: 'What two words make a simile?', answer: 'like or as', choices: ['like or as', 'is or was', 'and or but'] },
      { prompt: 'What does this mean?', subtext: 'He was as busy as a bee.',     answer: 'working hard', choices: ['working hard', 'buzzing loudly', 'flying around'] },
      { prompt: 'What does this mean?', subtext: 'The lake was like glass.',     answer: 'very still', choices: ['very still', 'very sharp', 'very cold'] },
    ],
    // t2 — metaphors
    2: [
      { prompt: 'What does this mean?', subtext: 'Time is a thief.',             answer: 'time passes quickly', choices: ['time passes quickly', 'clocks get stolen', 'thieves are slow'] },
      { prompt: 'What does this mean?', subtext: 'The classroom was a zoo.',     answer: 'it was wild',   choices: ['it was wild', 'it had animals', 'it was quiet'] },
      { prompt: 'What does this mean?', subtext: 'He has a heart of stone.',     answer: 'he is unkind',  choices: ['he is unkind', 'he is strong', 'he is sick'] },
      { prompt: 'Which one is a metaphor?', answer: 'the world is a stage', choices: ['the world is a stage', 'the world is like a stage', 'she stood on a stage'] },
      { prompt: 'What does this mean?', subtext: 'Her voice was music.',         answer: 'it sounded lovely', choices: ['it sounded lovely', 'she was singing', 'she was loud'] },
      { prompt: 'What does this mean?', subtext: 'The news was a punch.',        answer: 'it hurt',       choices: ['it hurt', 'it was fast', 'it was funny'] },
      { prompt: 'How is a metaphor different from a simile?', answer: 'no like or as', choices: ['no like or as', 'it is longer', 'it uses numbers'] },
      { prompt: 'What does this mean?', subtext: 'That test was a breeze.',      answer: 'it was easy',   choices: ['it was easy', 'it was windy', 'it was long'] },
      { prompt: 'What does this mean?', subtext: 'My brother is a night owl.',   answer: 'he stays up late', choices: ['he stays up late', 'he is a bird', 'he is loud'] },
      { prompt: 'What does this mean?', subtext: 'The city is a furnace in July.', answer: 'it is very hot', choices: ['it is very hot', 'it is on fire', 'it is busy'] },
    ],
    // t3 — idioms
    3: [
      { prompt: 'What does this mean?', subtext: "It's raining cats and dogs.",  answer: 'raining hard',  choices: ['raining hard', 'animals are falling', 'it is drizzling'] },
      { prompt: 'What does this mean?', subtext: 'Break a leg!',                 answer: 'good luck',     choices: ['good luck', 'be careful', 'you are hurt'] },
      { prompt: 'What does this mean?', subtext: 'She let the cat out of the bag.', answer: 'she told a secret', choices: ['she told a secret', 'she freed a cat', 'she packed a bag'] },
      { prompt: 'What does this mean?', subtext: 'That costs an arm and a leg.', answer: 'it is expensive', choices: ['it is expensive', 'it is dangerous', 'it is heavy'] },
      { prompt: 'What does this mean?', subtext: 'Hold your horses.',            answer: 'wait',          choices: ['wait', 'run fast', 'go riding'] },
      { prompt: 'What does this mean?', subtext: 'He is under the weather.',     answer: 'he feels sick', choices: ['he feels sick', 'he is outside', 'he is cold'] },
      { prompt: 'What does this mean?', subtext: 'Piece of cake.',               answer: 'very easy',     choices: ['very easy', 'very tasty', 'very small'] },
      { prompt: 'What does this mean?', subtext: 'They saw eye to eye.',         answer: 'they agreed',   choices: ['they agreed', 'they stared', 'they argued'] },
      { prompt: 'What does this mean?', subtext: 'Bite the bullet.',             answer: 'face something hard', choices: ['face something hard', 'chew loudly', 'run away'] },
      { prompt: 'What does this mean?', subtext: 'The ball is in your court.',   answer: 'it is your turn', choices: ['it is your turn', 'you lost the ball', 'go play tennis'] },
    ],
    // t4 — personification
    4: [
      { prompt: 'What does this mean?', subtext: 'The wind whispered through the trees.', answer: 'the wind was soft', choices: ['the wind was soft', 'someone spoke', 'the trees talked'] },
      { prompt: 'Which one is personification?', answer: 'the sun smiled', choices: ['the sun smiled', 'the sun was bright', 'the sun is a star'] },
      { prompt: 'What does this mean?', subtext: 'The old floor groaned under his feet.', answer: 'it creaked', choices: ['it creaked', 'it broke', 'it complained'] },
      { prompt: 'What does this mean?', subtext: 'Opportunity knocked at her door.', answer: 'she got a chance', choices: ['she got a chance', 'a visitor came', 'she moved house'] },
      { prompt: 'Which one is personification?', answer: 'the camera loves her', choices: ['the camera loves her', 'she loves the camera', 'the camera is new'] },
      { prompt: 'What does this mean?', subtext: 'The storm attacked the coast.', answer: 'the storm was fierce', choices: ['the storm was fierce', 'soldiers arrived', 'the coast fought'] },
      { prompt: 'What is personification?', answer: 'giving things human traits', choices: ['giving things human traits', 'comparing with like', 'exaggerating'] },
      { prompt: 'What does this mean?', subtext: 'My alarm clock screams at me every morning.', answer: 'it is very loud', choices: ['it is very loud', 'it is angry', 'it can talk'] },
      { prompt: 'What does this mean?', subtext: 'The last cookie was calling my name.', answer: 'i wanted it badly', choices: ['i wanted it badly', 'someone called me', 'the cookie talked'] },
      { prompt: 'Which one is personification?', answer: 'the leaves danced', choices: ['the leaves danced', 'the leaves fell', 'the leaves were red'] },
    ],
    // t5 — hyperbole and mixed identification
    5: [
      { prompt: 'What does this mean?', subtext: 'I have told you a million times.', answer: 'many times', choices: ['many times', 'exactly a million', 'only once'] },
      { prompt: 'What kind of figurative language is this?', subtext: 'This bag weighs a ton.', answer: 'hyperbole', choices: ['hyperbole', 'simile', 'personification'] },
      { prompt: 'What kind of figurative language is this?', subtext: 'He is as tall as a tree.', answer: 'simile', choices: ['simile', 'metaphor', 'hyperbole'] },
      { prompt: 'What kind of figurative language is this?', subtext: 'The thunder grumbled all night.', answer: 'personification', choices: ['personification', 'simile', 'idiom'] },
      { prompt: 'What kind of figurative language is this?', subtext: 'Life is a rollercoaster.', answer: 'metaphor', choices: ['metaphor', 'simile', 'hyperbole'] },
      { prompt: 'What does this mean?', subtext: 'I am so hungry I could eat a horse.', answer: 'very hungry', choices: ['very hungry', 'i like horses', 'i just ate'] },
      { prompt: 'What kind of figurative language is this?', subtext: 'Spill the beans.', answer: 'idiom', choices: ['idiom', 'metaphor', 'hyperbole'] },
      { prompt: 'What is hyperbole?', answer: 'a big exaggeration', choices: ['a big exaggeration', 'a small comparison', 'a repeated sound'] },
      { prompt: 'What does this mean?', subtext: 'That backpack is heavier than a planet.', answer: 'it is very heavy', choices: ['it is very heavy', 'it is from space', 'it is round'] },
      { prompt: 'What kind of figurative language is this?', subtext: 'Her smile was sunshine.', answer: 'metaphor', choices: ['metaphor', 'simile', 'idiom'] },
    ],
  },

  // ==========================================================================
  // GREEK & LATIN ROOTS (L.4.4.B → L.6.4.B). Roots unlock whole word families,
  // which is why this beats memorising definitions.
  // ==========================================================================
  'word-roots': {
    // t1 — common prefixes
    1: [
      { prompt: 'What does the prefix un- mean?',  answer: 'not',    choices: ['not', 'again', 'before'] },
      { prompt: 'What does the prefix re- mean?',  answer: 'again',  choices: ['again', 'not', 'under'] },
      { prompt: 'What does the prefix pre- mean?', answer: 'before', choices: ['before', 'after', 'not'] },
      { prompt: 'What does UNHAPPY mean?',         answer: 'not happy', choices: ['not happy', 'very happy', 'happy again'] },
      { prompt: 'What does REBUILD mean?',         answer: 'build again', choices: ['build again', 'not build', 'build before'] },
      { prompt: 'What does the prefix dis- mean?', answer: 'not',    choices: ['not', 'again', 'many'] },
      { prompt: 'What does PREHEAT mean?',         answer: 'heat before', choices: ['heat before', 'heat again', 'not heat'] },
      { prompt: 'What does the prefix mis- mean?', answer: 'wrongly', choices: ['wrongly', 'again', 'before'] },
      { prompt: 'What does MISPLACE mean?',        answer: 'put in the wrong place', choices: ['put in the wrong place', 'place again', 'place first'] },
      { prompt: 'What does the prefix sub- mean?', answer: 'under',  choices: ['under', 'over', 'again'] },
    ],
    // t2 — common suffixes
    2: [
      { prompt: 'What does the suffix -ful mean?',  answer: 'full of',   choices: ['full of', 'without', 'one who'] },
      { prompt: 'What does the suffix -less mean?', answer: 'without',   choices: ['without', 'full of', 'again'] },
      { prompt: 'What does the suffix -er mean?',   answer: 'one who',   choices: ['one who', 'without', 'before'] },
      { prompt: 'What does FEARLESS mean?',         answer: 'without fear', choices: ['without fear', 'full of fear', 'fear again'] },
      { prompt: 'What does JOYFUL mean?',           answer: 'full of joy',  choices: ['full of joy', 'without joy', 'joy again'] },
      { prompt: 'What does the suffix -able mean?', answer: 'can be',    choices: ['can be', 'cannot be', 'one who'] },
      { prompt: 'What does a TEACHER do?',          answer: 'one who teaches', choices: ['one who teaches', 'without teaching', 'teaches again'] },
      { prompt: 'What does the suffix -ly mean?',   answer: 'in that way', choices: ['in that way', 'full of', 'without'] },
      { prompt: 'What does READABLE mean?',         answer: 'can be read', choices: ['can be read', 'read again', 'without reading'] },
      { prompt: 'What does the suffix -ness mean?', answer: 'the state of', choices: ['the state of', 'one who', 'without'] },
    ],
    // t3 — tele, photo, graph, scope
    3: [
      { prompt: 'What does the root TELE mean?',   answer: 'far',    choices: ['far', 'light', 'write'] },
      { prompt: 'What does the root PHOTO mean?',  answer: 'light',  choices: ['light', 'far', 'sound'] },
      { prompt: 'What does the root GRAPH mean?',  answer: 'write',  choices: ['write', 'see', 'hear'] },
      { prompt: 'What does the root SCOPE mean?',  answer: 'see',    choices: ['see', 'write', 'far'] },
      { prompt: 'What does the root PHON mean?',   answer: 'sound',  choices: ['sound', 'light', 'life'] },
      { prompt: 'A TELESCOPE lets you what?',      answer: 'see far', choices: ['see far', 'write far', 'hear far'] },
      { prompt: 'What is a PHOTOGRAPH made with?', answer: 'light',  choices: ['light', 'sound', 'water'] },
      { prompt: 'What does a TELEPHONE carry?',    answer: 'sound from far', choices: ['sound from far', 'light from far', 'writing from far'] },
      { prompt: 'What does AUTOGRAPH mean?',       answer: 'self writing', choices: ['self writing', 'far writing', 'light writing'] },
      { prompt: 'What does the root AUTO mean?',   answer: 'self',   choices: ['self', 'far', 'again'] },
    ],
    // t4 — bio, geo, aqua, port, dict
    4: [
      { prompt: 'What does the root BIO mean?',   answer: 'life',   choices: ['life', 'earth', 'water'] },
      { prompt: 'What does the root GEO mean?',   answer: 'earth',  choices: ['earth', 'life', 'carry'] },
      { prompt: 'What does the root AQUA mean?',  answer: 'water',  choices: ['water', 'air', 'fire'] },
      { prompt: 'What does the root PORT mean?',  answer: 'carry',  choices: ['carry', 'speak', 'build'] },
      { prompt: 'What does the root DICT mean?',  answer: 'speak',  choices: ['speak', 'carry', 'see'] },
      { prompt: 'What does BIOLOGY study?',       answer: 'life',   choices: ['life', 'rocks', 'stars'] },
      { prompt: 'What does GEOGRAPHY describe?',  answer: 'the earth', choices: ['the earth', 'living things', 'the sea'] },
      { prompt: 'What does TRANSPORT mean?',      answer: 'carry across', choices: ['carry across', 'speak across', 'see across'] },
      { prompt: 'What does PREDICT mean?',        answer: 'speak before', choices: ['speak before', 'speak again', 'carry before'] },
      { prompt: 'What does an AQUARIUM hold?',    answer: 'water',  choices: ['water', 'air', 'sand'] },
    ],
    // t5 — struct, spect, scrib, cred, ject
    5: [
      { prompt: 'What does the root STRUCT mean?', answer: 'build',  choices: ['build', 'look', 'throw'] },
      { prompt: 'What does the root SPECT mean?',  answer: 'look',   choices: ['look', 'build', 'believe'] },
      { prompt: 'What does the root SCRIB mean?',  answer: 'write',  choices: ['write', 'look', 'throw'] },
      { prompt: 'What does the root CRED mean?',   answer: 'believe', choices: ['believe', 'build', 'write'] },
      { prompt: 'What does the root JECT mean?',   answer: 'throw',  choices: ['throw', 'write', 'believe'] },
      { prompt: 'What does CONSTRUCT mean?',       answer: 'build together', choices: ['build together', 'look together', 'throw together'] },
      { prompt: 'What does INSPECT mean?',         answer: 'look into', choices: ['look into', 'build into', 'write into'] },
      { prompt: 'What does INCREDIBLE mean?',      answer: 'hard to believe', choices: ['hard to believe', 'hard to build', 'hard to see'] },
      { prompt: 'What does DESCRIBE mean?',        answer: 'write about', choices: ['write about', 'look about', 'throw about'] },
      { prompt: 'What does EJECT mean?',           answer: 'throw out', choices: ['throw out', 'build out', 'look out'] },
    ],
  },

  // ==========================================================================
  // WORD MEANINGS — plain vocabulary (L.1.6, L.2.6, L.3.6). Know what a word
  // you were taught actually means.
  //
  // Distinct from WORD ROOTS above, which asks a kid to BUILD a meaning out of
  // parts (con + struct). This one asks whether they simply know the word. It
  // is also the type a grown-up's class list overrides (class-modes.ts), so
  // this library is what runs when no list is set — the words here are the
  // kind a school teaches, not obscure ones.
  //
  // Every distractor is a real definition at the same register as the answer.
  // Nonsense options make the question a matching exercise: a kid scans for the
  // only sentence that sounds like a definition and never has to know the word.
  // ==========================================================================
  'word-meaning': {
    // t1 — the most common describing words (K-1)
    1: [
      { prompt: 'What does BIG mean?',        answer: 'very large', choices: ['very large', 'very small', 'very fast'] },
      { prompt: 'What does HOT mean?',        answer: 'very warm', choices: ['very warm', 'very cold', 'very wet'] },
      { prompt: 'What does SAD mean?',        answer: 'feeling unhappy', choices: ['feeling unhappy', 'feeling excited', 'feeling hungry'] },
      { prompt: 'What does FAST mean?',       answer: 'moving quickly', choices: ['moving quickly', 'moving slowly', 'staying still'] },
      { prompt: 'What does TINY mean?',       answer: 'very small', choices: ['very small', 'very loud', 'very heavy'] },
      { prompt: 'What does LOUD mean?',       answer: 'making a big sound', choices: ['making a big sound', 'making no sound', 'smelling nice'] },
      { prompt: 'What does WET mean?',        answer: 'covered in water', choices: ['covered in water', 'covered in dust', 'full of air'] },
      { prompt: 'What does SOFT mean?',       answer: 'nice to touch, not hard', choices: ['nice to touch, not hard', 'sharp and rough', 'very cold'] },
      { prompt: 'What does DARK mean?',       answer: 'with no light', choices: ['with no light', 'with lots of light', 'very noisy'] },
      { prompt: 'What does EMPTY mean?',      answer: 'with nothing inside', choices: ['with nothing inside', 'filled right up', 'shut tight'] },
    ],
    // t2 — everyday words a first or second grader meets in a reader
    2: [
      { prompt: 'What does BRAVE mean?',      answer: 'not afraid when something is hard', choices: ['not afraid when something is hard', 'afraid of everything', 'very tired'] },
      { prompt: 'What does CALM mean?',       answer: 'quiet and still', choices: ['quiet and still', 'noisy and busy', 'cold and wet'] },
      { prompt: 'What does GATHER mean?',     answer: 'to collect things together', choices: ['to collect things together', 'to throw things away', 'to break something'] },
      { prompt: 'What does SILENT mean?',     answer: 'making no sound at all', choices: ['making no sound at all', 'making a loud noise', 'moving very fast'] },
      { prompt: 'What does GENTLE mean?',     answer: 'soft and careful', choices: ['soft and careful', 'rough and hard', 'loud and fast'] },
      { prompt: 'What does WEARY mean?',      answer: 'very tired', choices: ['very tired', 'very hungry', 'very excited'] },
      { prompt: 'What does STURDY mean?',     answer: 'strong and not easy to break', choices: ['strong and not easy to break', 'thin and easy to bend', 'light as a feather'] },
      { prompt: 'What does CHILLY mean?',     answer: 'a little bit cold', choices: ['a little bit cold', 'boiling hot', 'slightly wet'] },
      { prompt: 'What does SHINY mean?',      answer: 'bright and reflecting light', choices: ['bright and reflecting light', 'dull and dusty', 'rough and bumpy'] },
      { prompt: 'What does CROWDED mean?',    answer: 'full of people or things', choices: ['full of people or things', 'completely empty', 'far away'] },
    ],
    // t3 — grade 2-3 story words
    3: [
      { prompt: 'What does CURIOUS mean?',    answer: 'wanting to know more', choices: ['wanting to know more', 'not interested at all', 'feeling angry'] },
      { prompt: 'What does ENORMOUS mean?',   answer: 'extremely large', choices: ['extremely large', 'extremely small', 'extremely fast'] },
      { prompt: 'What does ANCIENT mean?',    answer: 'very, very old', choices: ['very, very old', 'brand new', 'very expensive'] },
      { prompt: 'What does FRAGILE mean?',    answer: 'easy to break', choices: ['easy to break', 'hard to break', 'heavy to lift'] },
      { prompt: 'What does RESCUE mean?',     answer: 'to save someone from danger', choices: ['to save someone from danger', 'to leave someone behind', 'to chase someone'] },
      { prompt: 'What does VANISH mean?',     answer: 'to disappear suddenly', choices: ['to disappear suddenly', 'to appear slowly', 'to grow bigger'] },
      { prompt: 'What does DRENCHED mean?',   answer: 'completely soaked', choices: ['completely soaked', 'completely dry', 'partly frozen'] },
      { prompt: 'What does WANDER mean?',     answer: 'to walk with no set path', choices: ['to walk with no set path', 'to run in a straight line', 'to sit still'] },
      { prompt: 'What does GRUMPY mean?',     answer: 'in a bad mood', choices: ['in a bad mood', 'in a cheerful mood', 'feeling scared'] },
      { prompt: 'What does DELICATE mean?',   answer: 'needing careful handling', choices: ['needing careful handling', 'very tough', 'very loud'] },
    ],
    // t4 — grade 3-4, the band where vocabulary starts carrying the reading
    4: [
      { prompt: 'What does RELUCTANT mean?',  answer: 'not wanting to do something', choices: ['not wanting to do something', 'eager to do something', 'unable to speak'] },
      { prompt: 'What does ABUNDANT mean?',   answer: 'existing in large amounts', choices: ['existing in large amounts', 'very rare', 'slightly damp'] },
      { prompt: 'What does SUMMIT mean?',     answer: 'the very top of a mountain', choices: ['the very top of a mountain', 'the bottom of a valley', 'a narrow path'] },
      { prompt: 'What does PECULIAR mean?',   answer: 'strange or unusual', choices: ['strange or unusual', 'completely ordinary', 'brightly colored'] },
      { prompt: 'What does STUBBORN mean?',   answer: 'refusing to change your mind', choices: ['refusing to change your mind', 'changing your mind often', 'speaking very quietly'] },
      { prompt: 'What does DEMOLISH mean?',   answer: 'to knock down completely', choices: ['to knock down completely', 'to build carefully', 'to paint over'] },
      { prompt: 'What does FEEBLE mean?',     answer: 'weak and without strength', choices: ['weak and without strength', 'powerful and strong', 'quick and clever'] },
      { prompt: 'What does MURMUR mean?',     answer: 'to speak very quietly', choices: ['to speak very quietly', 'to shout loudly', 'to laugh out loud'] },
      { prompt: 'What does ABANDON mean?',    answer: 'to leave something behind for good', choices: ['to leave something behind for good', 'to hold onto tightly', 'to repair carefully'] },
      { prompt: 'What does WEARISOME mean?',  answer: 'tiring and dull', choices: ['tiring and dull', 'exciting and new', 'short and sweet'] },
    ],
    // t5 — grade 4-5 academic vocabulary
    5: [
      { prompt: 'What does PERSISTENT mean?', answer: 'carrying on even when it is hard', choices: ['carrying on even when it is hard', 'giving up quickly', 'working carelessly'] },
      { prompt: 'What does OBSTACLE mean?',   answer: 'something in the way that blocks you', choices: ['something in the way that blocks you', 'a clear open path', 'a helpful tool'] },
      { prompt: 'What does RESOURCEFUL mean?', answer: 'good at finding ways to solve problems', choices: ['good at finding ways to solve problems', 'easily confused', 'very wealthy'] },
      { prompt: 'What does DELIBERATE mean?', answer: 'done on purpose', choices: ['done on purpose', 'done by accident', 'done very quickly'] },
      { prompt: 'What does SCARCE mean?',     answer: 'hard to find because there is little of it', choices: ['hard to find because there is little of it', 'everywhere you look', 'extremely heavy'] },
      { prompt: 'What does ELABORATE mean?',  answer: 'with lots of careful detail', choices: ['with lots of careful detail', 'very plain and simple', 'made in a hurry'] },
      { prompt: 'What does INEVITABLE mean?', answer: 'certain to happen', choices: ['certain to happen', 'impossible to happen', 'happening only rarely'] },
      { prompt: 'What does CONCEAL mean?',    answer: 'to hide something from view', choices: ['to hide something from view', 'to show something openly', 'to describe something'] },
      { prompt: 'What does DIMINISH mean?',   answer: 'to become smaller or less', choices: ['to become smaller or less', 'to grow larger', 'to stay exactly the same'] },
      { prompt: 'What does PRECISE mean?',    answer: 'exact and accurate', choices: ['exact and accurate', 'roughly right', 'completely wrong'] },
    ],
  },
};
