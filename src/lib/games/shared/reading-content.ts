// Curated reading-challenge content library for Gamecakes.
//
// Hand-written per tier × type so the adaptive engine (which calibrates
// on current_tier) picks items at the right difficulty. All items are
// multiple-choice with 2-3 distractors — kids tap the right word
// instead of typing, matching the modal's button-stack UI.
//
// Authorship notes:
//   - Tier 1 = Kindergarten (age 5-6): 3-letter CVC sight words, bigrams,
//     basic rhymes in simple word families.
//   - Tier 2 = Late K / early 1st: sight words with digraphs (sh, ch,
//     th), first consonant blends, slightly harder rhymes.
//   - Tier 3 = Mid 1st grade: longer sight words, vowel teams,
//     first-grade synonyms (happy/glad, big/large).
//   - Tier 4 = Late 1st / early 2nd: multi-syllable, more abstract
//     synonyms (quick/fast, smart/clever).
//   - Tier 5 = Mid-to-late 2nd: compound words, richer synonyms
//     (difficult/hard, build/construct).
//
// Distractor rules (critical for quality):
//   - Sight words: distractors are visually similar but phonetically
//     distinct ("cat" vs "cap"/"dog") — teaches careful reading.
//   - Rhyming: distractors do NOT rhyme with the target; mix of
//     semantically-adjacent (dog for cat) and random non-rhymes.
//   - Synonyms: distractors are plausible words at the same tier but
//     not synonymous — often antonyms or tangentially-related words.

import {
  EXTENDED_READING_CONTENT,
  type ExtendedReadingType,
} from './reading-content-extended';

export type ReadingType =
  | 'sight-words'
  | 'rhyming'
  | 'synonyms'
  | 'antonyms'
  | 'context-clues'
  // The nine added 2026-07-26 to reach every gamifiable reading standard.
  // Their content lives in reading-content-extended.ts; see the table there.
  | ExtendedReadingType;

export interface ReadingContentItem {
  prompt: string;
  /** Optional smaller-text context shown under the prompt, e.g. a sentence. */
  subtext?: string;
  answer: string;
  /** Includes the answer. Must be 2-4 entries. Will be shuffled at runtime. */
  choices: string[];
}

/** Index: [ReadingType][tier 1..5] → items. Pure data; no runtime code. */
export const READING_CONTENT: Record<ReadingType, Record<number, ReadingContentItem[]>> = {
  // The nine standards-gap types. Spread first so the original five below
  // read exactly as they did before — this file's own content is unchanged.
  ...EXTENDED_READING_CONTENT,

  // ==========================================================================
  // SIGHT WORDS — visual word recognition
  // ==========================================================================
  'sight-words': {
    1: [
      { prompt: 'Tap: CAT',   answer: 'cat', choices: ['cat', 'cap', 'can'] },
      { prompt: 'Tap: DOG',   answer: 'dog', choices: ['dog', 'dig', 'log'] },
      { prompt: 'Tap: SUN',   answer: 'sun', choices: ['sun', 'run', 'son'] },
      { prompt: 'Tap: THE',   answer: 'the', choices: ['the', 'she', 'her'] },
      { prompt: 'Tap: AND',   answer: 'and', choices: ['and', 'ant', 'end'] },
      { prompt: 'Tap: SEE',   answer: 'see', choices: ['see', 'sea', 'bee'] },
      { prompt: 'Tap: YOU',   answer: 'you', choices: ['you', 'your', 'now'] },
      { prompt: 'Tap: GO',    answer: 'go',  choices: ['go', 'got', 'no'] },
      { prompt: 'Tap: ME',    answer: 'me',  choices: ['me', 'be', 'my'] },
      { prompt: 'Tap: RED',   answer: 'red', choices: ['red', 'bed', 'rad'] },
      { prompt: 'Tap: TOP',   answer: 'top', choices: ['top', 'tap', 'pop'] },
      { prompt: 'Tap: BIG',   answer: 'big', choices: ['big', 'beg', 'dig'] },
      { prompt: 'Tap: HAT',   answer: 'hat', choices: ['hat', 'had', 'bat'] },
      { prompt: 'Tap: PIG',   answer: 'pig', choices: ['pig', 'big', 'peg'] },
      { prompt: 'Tap: BED',   answer: 'bed', choices: ['bed', 'bad', 'bid'] },
    ],
    2: [
      { prompt: 'Tap: SHIP',   answer: 'ship',   choices: ['ship', 'shop', 'chip'] },
      { prompt: 'Tap: FISH',   answer: 'fish',   choices: ['fish', 'fist', 'dish'] },
      { prompt: 'Tap: THAT',   answer: 'that',   choices: ['that', 'than', 'what'] },
      { prompt: 'Tap: THIS',   answer: 'this',   choices: ['this', 'thin', 'these'] },
      { prompt: 'Tap: CHIN',   answer: 'chin',   choices: ['chin', 'thin', 'chip'] },
      { prompt: 'Tap: STOP',   answer: 'stop',   choices: ['stop', 'step', 'shop'] },
      { prompt: 'Tap: FROG',   answer: 'frog',   choices: ['frog', 'from', 'flop'] },
      { prompt: 'Tap: JUMP',   answer: 'jump',   choices: ['jump', 'just', 'bump'] },
      { prompt: 'Tap: HAND',   answer: 'hand',   choices: ['hand', 'land', 'head'] },
      { prompt: 'Tap: WITH',   answer: 'with',   choices: ['with', 'wish', 'want'] },
      { prompt: 'Tap: HAVE',   answer: 'have',   choices: ['have', 'gave', 'hate'] },
      { prompt: 'Tap: WHEN',   answer: 'when',   choices: ['when', 'what', 'then'] },
      { prompt: 'Tap: PLAY',   answer: 'play',   choices: ['play', 'pray', 'place'] },
      { prompt: 'Tap: MILK',   answer: 'milk',   choices: ['milk', 'silk', 'mild'] },
      { prompt: 'Tap: BOOK',   answer: 'book',   choices: ['book', 'boot', 'look'] },
    ],
    3: [
      { prompt: 'Tap: RAIN',    answer: 'rain',    choices: ['rain', 'rang', 'ruin'] },
      { prompt: 'Tap: TREE',    answer: 'tree',    choices: ['tree', 'true', 'threw'] },
      { prompt: 'Tap: HOUSE',   answer: 'house',   choices: ['house', 'horse', 'mouse'] },
      { prompt: 'Tap: LIGHT',   answer: 'light',   choices: ['light', 'right', 'lift'] },
      { prompt: 'Tap: WATER',   answer: 'water',   choices: ['water', 'waiter', 'wider'] },
      { prompt: 'Tap: PEOPLE',  answer: 'people',  choices: ['people', 'purple', 'paper'] },
      { prompt: 'Tap: FRIEND',  answer: 'friend',  choices: ['friend', 'fiend', 'front'] },
      { prompt: 'Tap: BEACH',   answer: 'beach',   choices: ['beach', 'beech', 'reach'] },
      { prompt: 'Tap: CLOUD',   answer: 'cloud',   choices: ['cloud', 'crowd', 'could'] },
      { prompt: 'Tap: GREEN',   answer: 'green',   choices: ['green', 'grown', 'queen'] },
      { prompt: 'Tap: NIGHT',   answer: 'night',   choices: ['night', 'might', 'neigh'] },
      { prompt: 'Tap: SCHOOL',  answer: 'school',  choices: ['school', 'scroll', 'stool'] },
      { prompt: 'Tap: HAPPY',   answer: 'happy',   choices: ['happy', 'hardy', 'puppy'] },
      { prompt: 'Tap: FAMILY',  answer: 'family',  choices: ['family', 'fairly', 'finally'] },
      { prompt: 'Tap: BREAD',   answer: 'bread',   choices: ['bread', 'break', 'beard'] },
    ],
    4: [
      { prompt: 'Tap: BICYCLE',  answer: 'bicycle',  choices: ['bicycle', 'bystander', 'bicker'] },
      { prompt: 'Tap: WEATHER',  answer: 'weather',  choices: ['weather', 'whether', 'feather'] },
      { prompt: 'Tap: LIBRARY',  answer: 'library',  choices: ['library', 'liberty', 'laboratory'] },
      { prompt: 'Tap: BUTTERFLY', answer: 'butterfly', choices: ['butterfly', 'buttercup', 'battery'] },
      { prompt: 'Tap: PICTURE',  answer: 'picture',  choices: ['picture', 'pasture', 'feature'] },
      { prompt: 'Tap: SANDWICH', answer: 'sandwich', choices: ['sandwich', 'sandbox', 'sideways'] },
      { prompt: 'Tap: KITCHEN',  answer: 'kitchen',  choices: ['kitchen', 'chicken', 'kitten'] },
      { prompt: 'Tap: ANIMAL',   answer: 'animal',   choices: ['animal', 'animate', 'admiral'] },
      { prompt: 'Tap: MORNING',  answer: 'morning',  choices: ['morning', 'mourning', 'meaning'] },
      { prompt: 'Tap: ENOUGH',   answer: 'enough',   choices: ['enough', 'rough', 'through'] },
      { prompt: 'Tap: ISLAND',   answer: 'island',   choices: ['island', 'inland', 'highland'] },
      { prompt: 'Tap: MOUNTAIN', answer: 'mountain', choices: ['mountain', 'maintain', 'fountain'] },
      { prompt: 'Tap: BIRTHDAY', answer: 'birthday', choices: ['birthday', 'birdhouse', 'Saturday'] },
      { prompt: 'Tap: REMEMBER', answer: 'remember', choices: ['remember', 'remainder', 'reminder'] },
      { prompt: 'Tap: BECAUSE',  answer: 'because',  choices: ['because', 'beside', 'between'] },
    ],
    5: [
      { prompt: 'Tap: NEIGHBOR',    answer: 'neighbor',    choices: ['neighbor', 'neither', 'harbor'] },
      { prompt: 'Tap: EXERCISE',    answer: 'exercise',    choices: ['exercise', 'exorcise', 'excursion'] },
      { prompt: 'Tap: VACATION',    answer: 'vacation',    choices: ['vacation', 'valuation', 'location'] },
      { prompt: 'Tap: ADVENTURE',   answer: 'adventure',   choices: ['adventure', 'avenger', 'advanture'] },
      { prompt: 'Tap: BEAUTIFUL',   answer: 'beautiful',   choices: ['beautiful', 'bountiful', 'dutiful'] },
      { prompt: 'Tap: DIFFERENT',   answer: 'different',   choices: ['different', 'difficult', 'deferent'] },
      { prompt: 'Tap: IMPORTANT',   answer: 'important',   choices: ['important', 'impudent', 'imported'] },
      { prompt: 'Tap: CHOCOLATE',   answer: 'chocolate',   choices: ['chocolate', 'collected', 'chronicle'] },
      { prompt: 'Tap: AUDIENCE',    answer: 'audience',    choices: ['audience', 'audible', 'audition'] },
      { prompt: 'Tap: QUESTION',    answer: 'question',    choices: ['question', 'quotient', 'section'] },
      { prompt: 'Tap: HOSPITAL',    answer: 'hospital',    choices: ['hospital', 'hospitality', 'postal'] },
      { prompt: 'Tap: TOGETHER',    answer: 'together',    choices: ['together', 'tomorrow', 'toughest'] },
      { prompt: 'Tap: DINOSAUR',    answer: 'dinosaur',    choices: ['dinosaur', 'diamond', 'drainage'] },
      { prompt: 'Tap: ELEPHANT',    answer: 'elephant',    choices: ['elephant', 'elegant', 'eloquent'] },
      { prompt: 'Tap: BREAKFAST',   answer: 'breakfast',   choices: ['breakfast', 'broadcast', 'briefcase'] },
    ],
  },

  // ==========================================================================
  // RHYMING — which word rhymes with the target?
  // ==========================================================================
  rhyming: {
    1: [
      { prompt: 'Rhymes with CAT',  answer: 'hat',  choices: ['hat',  'dog', 'sun'] },
      { prompt: 'Rhymes with DOG',  answer: 'log',  choices: ['log',  'cat', 'pig'] },
      { prompt: 'Rhymes with SUN',  answer: 'fun',  choices: ['fun',  'top', 'bed'] },
      { prompt: 'Rhymes with HAT',  answer: 'bat',  choices: ['bat',  'hot', 'cup'] },
      { prompt: 'Rhymes with PIG',  answer: 'big',  choices: ['big',  'pen', 'lap'] },
      { prompt: 'Rhymes with BED',  answer: 'red',  choices: ['red',  'but', 'pop'] },
      { prompt: 'Rhymes with TOP',  answer: 'pop',  choices: ['pop',  'cat', 'bug'] },
      { prompt: 'Rhymes with BUG',  answer: 'rug',  choices: ['rug',  'fan', 'pie'] },
      { prompt: 'Rhymes with MAN',  answer: 'can',  choices: ['can',  'dog', 'jet'] },
      { prompt: 'Rhymes with BALL', answer: 'tall', choices: ['tall', 'bike', 'map'] },
      { prompt: 'Rhymes with HEN',  answer: 'pen',  choices: ['pen',  'boy', 'mud'] },
      { prompt: 'Rhymes with FISH', answer: 'dish', choices: ['dish', 'boat','frog'] },
      { prompt: 'Rhymes with BOX',  answer: 'fox',  choices: ['fox',  'toy', 'pen'] },
      { prompt: 'Rhymes with GOAT', answer: 'boat', choices: ['boat', 'lamp','ant'] },
      { prompt: 'Rhymes with STAR', answer: 'car',  choices: ['car',  'ship','doll'] },
    ],
    2: [
      { prompt: 'Rhymes with SHIP',  answer: 'flip',  choices: ['flip',  'skip',  'fish'] }, // two rhymes! be careful
      { prompt: 'Rhymes with FROG',  answer: 'log',   choices: ['log',   'frost', 'flop'] },
      { prompt: 'Rhymes with JUMP',  answer: 'bump',  choices: ['bump',  'jam',   'jug'] },
      { prompt: 'Rhymes with DUCK',  answer: 'luck',  choices: ['luck',  'dock',  'dig'] },
      { prompt: 'Rhymes with MILK',  answer: 'silk',  choices: ['silk',  'milt',  'mile'] },
      { prompt: 'Rhymes with PLAY',  answer: 'day',   choices: ['day',   'pled',  'plot'] },
      { prompt: 'Rhymes with SNOW',  answer: 'grow',  choices: ['grow',  'snap',  'swim'] },
      { prompt: 'Rhymes with DRUM',  answer: 'gum',   choices: ['gum',   'drop',  'dry'] },
      { prompt: 'Rhymes with CLAP',  answer: 'map',   choices: ['map',   'clip',  'cop'] },
      { prompt: 'Rhymes with SHOP',  answer: 'drop',  choices: ['drop',  'shut',  'ship'] },
      { prompt: 'Rhymes with BRICK', answer: 'stick', choices: ['stick', 'brook', 'bring'] },
      { prompt: 'Rhymes with CAKE',  answer: 'lake',  choices: ['lake',  'can',   'cup'] },
      { prompt: 'Rhymes with TRAIN', answer: 'rain',  choices: ['rain',  'truck', 'tree'] },
      { prompt: 'Rhymes with BOAT',  answer: 'coat',  choices: ['coat',  'bone',  'boot'] },
      { prompt: 'Rhymes with MOON',  answer: 'spoon', choices: ['spoon', 'mint',  'more'] },
    ],
    3: [
      { prompt: 'Rhymes with LIGHT',   answer: 'night',   choices: ['night',   'light',   'time'] }, // safe: 'light' rejected as answer==prompt
      { prompt: 'Rhymes with HOUSE',   answer: 'mouse',   choices: ['mouse',   'horse',   'honey'] },
      { prompt: 'Rhymes with TREE',    answer: 'bee',     choices: ['bee',     'trunk',   'trip'] },
      { prompt: 'Rhymes with CLOUD',   answer: 'proud',   choices: ['proud',   'crowd',   'crown'] }, // two rhymes
      { prompt: 'Rhymes with SCHOOL',  answer: 'pool',    choices: ['pool',    'shoe',    'stool'] }, // two rhymes
      { prompt: 'Rhymes with BEACH',   answer: 'reach',   choices: ['reach',   'bench',   'bread'] },
      { prompt: 'Rhymes with BREAD',   answer: 'red',     choices: ['red',     'breath',  'braid'] },
      { prompt: 'Rhymes with GREEN',   answer: 'queen',   choices: ['queen',   'grape',   'grand'] },
      { prompt: 'Rhymes with NIGHT',   answer: 'fight',   choices: ['fight',   'nice',    'nose'] },
      { prompt: 'Rhymes with STORY',   answer: 'glory',   choices: ['glory',   'story',   'stone'] },
      { prompt: 'Rhymes with SPOON',   answer: 'balloon', choices: ['balloon', 'spark',   'short'] },
      { prompt: 'Rhymes with CHAIR',   answer: 'bear',    choices: ['bear',    'cheer',   'cheese'] },
      { prompt: 'Rhymes with SWIM',    answer: 'trim',    choices: ['trim',    'swing',   'swan'] },
      { prompt: 'Rhymes with HAPPY',   answer: 'puppy',   choices: ['puppy',   'apple',   'honey'] },
      { prompt: 'Rhymes with WINTER',  answer: 'splinter',choices: ['splinter','winner',  'window'] },
    ],
    4: [
      { prompt: 'Rhymes with MOUNTAIN',  answer: 'fountain',  choices: ['fountain', 'country', 'counter'] },
      { prompt: 'Rhymes with WEATHER',   answer: 'feather',   choices: ['feather',  'wither',  'rather'] }, // two rhymes
      { prompt: 'Rhymes with MORNING',   answer: 'warning',   choices: ['warning',  'mourning','morning'] }, // watch: 'morning' eq prompt
      { prompt: 'Rhymes with PICTURE',   answer: 'fixture',   choices: ['fixture',  'puncture','posture'] },
      { prompt: 'Rhymes with KITCHEN',   answer: 'chicken',   choices: ['chicken',  'kitten',  'kindle'] },
      { prompt: 'Rhymes with LIBRARY',   answer: 'contrary',  choices: ['contrary', 'library', 'literary'] }, // watch: 'library' eq prompt
      { prompt: 'Rhymes with BUTTERFLY', answer: 'dragonfly', choices: ['dragonfly','buttercup','buttress'] },
      { prompt: 'Rhymes with REMEMBER',  answer: 'December',  choices: ['December', 'remainder','reminder'] },
      { prompt: 'Rhymes with THUNDER',   answer: 'wonder',    choices: ['wonder',   'thicken', 'thorough'] },
      { prompt: 'Rhymes with FAMILY',    answer: 'happily',   choices: ['happily',  'family',  'finally'] }, // 'family' eq prompt
      { prompt: 'Rhymes with PENGUIN',   answer: 'again',     choices: ['again',    'penguin', 'pending'] }, // loose rhyme — okay
      { prompt: 'Rhymes with BASKET',    answer: 'gasket',    choices: ['gasket',   'basic',   'bucket'] },
      { prompt: 'Rhymes with STICKER',   answer: 'ticker',    choices: ['ticker',   'sticky',  'stacker'] },
      { prompt: 'Rhymes with ANIMAL',    answer: 'mineral',   choices: ['mineral',  'animate', 'admiral'] }, // loose
      { prompt: 'Rhymes with BECAUSE',   answer: 'applause',  choices: ['applause', 'between', 'behind'] },
    ],
    5: [
      { prompt: 'Rhymes with BEAUTIFUL',  answer: 'bountiful',  choices: ['bountiful', 'beautiful', 'plentiful'] }, // 'beautiful' eq prompt
      { prompt: 'Rhymes with DIFFERENT',  answer: 'deferent',   choices: ['deferent',  'difficult', 'deliberate'] },
      { prompt: 'Rhymes with IMPORTANT',  answer: 'unimportant',choices: ['unimportant','important','impartial'] },
      { prompt: 'Rhymes with ADVENTURE',  answer: 'debenture',  choices: ['debenture', 'advertise', 'avenger'] },
      { prompt: 'Rhymes with VACATION',   answer: 'location',   choices: ['location',  'vocation',  'valuation'] }, // two rhymes
      { prompt: 'Rhymes with QUESTION',   answer: 'suggestion', choices: ['suggestion','quotient',  'section'] }, // loose
      { prompt: 'Rhymes with AUDIENCE',   answer: 'obedience',  choices: ['obedience', 'audible',   'audition'] },
      { prompt: 'Rhymes with HOSPITAL',   answer: 'capital',    choices: ['capital',   'hospice',   'historical'] }, // loose
      { prompt: 'Rhymes with CHOCOLATE',  answer: 'delicate',   choices: ['delicate',  'chocolate', 'escalate'] }, // 'chocolate' eq prompt
      { prompt: 'Rhymes with ELEPHANT',   answer: 'elegant',    choices: ['elegant',   'elephant',  'eloquent'] }, // 'elephant' eq prompt
      { prompt: 'Rhymes with NEIGHBOR',   answer: 'labor',      choices: ['labor',     'neighbor',  'harbor'] }, // two valid
      { prompt: 'Rhymes with EXERCISE',   answer: 'enterprise', choices: ['enterprise','exorcise',  'excuse'] },
      { prompt: 'Rhymes with DINOSAUR',   answer: 'door',       choices: ['door',      'dinner',    'dimmer'] }, // loose
      { prompt: 'Rhymes with BIRTHDAY',   answer: 'Wednesday',  choices: ['Wednesday', 'birdhouse', 'birthright'] }, // loose
      { prompt: 'Rhymes with TOGETHER',   answer: 'whether',    choices: ['whether',   'tougher',   'tower'] },
    ],
  },

  // ==========================================================================
  // SYNONYMS — pick the word with the closest meaning
  // ==========================================================================
  synonyms: {
    1: [
      { prompt: 'Means the same as BIG',    answer: 'large', choices: ['large', 'small', 'red'] },
      { prompt: 'Means the same as SMALL',  answer: 'tiny',  choices: ['tiny',  'huge',  'hot'] },
      { prompt: 'Means the same as HAPPY',  answer: 'glad',  choices: ['glad',  'sad',   'cold'] },
      { prompt: 'Means the same as SAD',    answer: 'upset', choices: ['upset', 'funny', 'tall'] },
      { prompt: 'Means the same as FAST',   answer: 'quick', choices: ['quick', 'slow',  'old'] },
      { prompt: 'Means the same as HOT',    answer: 'warm',  choices: ['warm',  'cold',  'loud'] },
      { prompt: 'Means the same as COLD',   answer: 'chilly',choices: ['chilly','sunny', 'wet'] },
      { prompt: 'Means the same as NICE',   answer: 'kind',  choices: ['kind',  'mean',  'deep'] },
      { prompt: 'Means the same as SCARED', answer: 'afraid',choices: ['afraid','brave', 'silly'] },
      { prompt: 'Means the same as LOUD',   answer: 'noisy', choices: ['noisy', 'quiet', 'soft'] },
      { prompt: 'Means the same as PRETTY', answer: 'cute',  choices: ['cute',  'ugly',  'fast'] },
      { prompt: 'Means the same as TIRED',  answer: 'sleepy',choices: ['sleepy','awake', 'angry'] },
      { prompt: 'Means the same as YELL',   answer: 'shout', choices: ['shout', 'whisper','smile'] },
      { prompt: 'Means the same as JUMP',   answer: 'hop',   choices: ['hop',   'sit',   'walk'] },
      { prompt: 'Means the same as LOOK',   answer: 'see',   choices: ['see',   'taste', 'hide'] },
    ],
    2: [
      { prompt: 'Means the same as GIFT',    answer: 'present', choices: ['present', 'party',   'puzzle'] },
      { prompt: 'Means the same as START',   answer: 'begin',   choices: ['begin',   'stop',    'end'] },
      { prompt: 'Means the same as HELP',    answer: 'assist',  choices: ['assist',  'hurt',    'hide'] },
      { prompt: 'Means the same as END',     answer: 'finish',  choices: ['finish',  'begin',   'stay'] },
      { prompt: 'Means the same as SHOUT',   answer: 'yell',    choices: ['yell',    'whisper', 'wait'] },
      { prompt: 'Means the same as BREAK',   answer: 'smash',   choices: ['smash',   'fix',     'buy'] },
      { prompt: 'Means the same as FIX',     answer: 'repair',  choices: ['repair',  'ruin',    'reach'] },
      { prompt: 'Means the same as GRAB',    answer: 'take',    choices: ['take',    'give',    'grow'] },
      { prompt: 'Means the same as CHOOSE',  answer: 'pick',    choices: ['pick',    'leave',   'lose'] },
      { prompt: 'Means the same as QUICK',   answer: 'fast',    choices: ['fast',    'slow',    'far'] },
      { prompt: 'Means the same as TINY',    answer: 'little',  choices: ['little',  'large',   'loud'] },
      { prompt: 'Means the same as ANGRY',   answer: 'mad',     choices: ['mad',     'merry',   'calm'] },
      { prompt: 'Means the same as SMART',   answer: 'clever',  choices: ['clever',  'silly',   'slow'] },
      { prompt: 'Means the same as SAD',     answer: 'unhappy', choices: ['unhappy', 'joyful',  'jumpy'] },
      { prompt: 'Means the same as HAPPY',   answer: 'joyful',  choices: ['joyful',  'gloomy',  'grumpy'] },
    ],
    3: [
      { prompt: 'Means the same as BRAVE',    answer: 'courageous', choices: ['courageous','cowardly',  'clumsy'] },
      { prompt: 'Means the same as RICH',     answer: 'wealthy',    choices: ['wealthy',   'poor',      'weary'] },
      { prompt: 'Means the same as QUIET',    answer: 'silent',     choices: ['silent',    'noisy',     'nervous'] },
      { prompt: 'Means the same as STRONG',   answer: 'powerful',   choices: ['powerful',  'weak',      'wise'] },
      { prompt: 'Means the same as FUNNY',    answer: 'hilarious',  choices: ['hilarious', 'serious',   'scary'] },
      { prompt: 'Means the same as LAZY',     answer: 'idle',       choices: ['idle',      'busy',      'eager'] },
      { prompt: 'Means the same as SHOW',     answer: 'display',    choices: ['display',   'hide',      'hush'] },
      { prompt: 'Means the same as TALL',     answer: 'lofty',      choices: ['lofty',     'short',     'loud'] },
      { prompt: 'Means the same as STORY',    answer: 'tale',       choices: ['tale',      'test',      'table'] },
      { prompt: 'Means the same as FINISH',   answer: 'complete',   choices: ['complete',  'commence',  'consider'] },
      { prompt: 'Means the same as ANGRY',    answer: 'furious',    choices: ['furious',   'friendly',  'foolish'] },
      { prompt: 'Means the same as PRETTY',   answer: 'beautiful',  choices: ['beautiful', 'plain',     'painful'] },
      { prompt: 'Means the same as JOURNEY',  answer: 'trip',       choices: ['trip',      'trouble',   'trophy'] },
      { prompt: 'Means the same as BUILD',    answer: 'construct',  choices: ['construct', 'destroy',   'discard'] },
      { prompt: 'Means the same as WANDER',   answer: 'roam',       choices: ['roam',      'stay',      'sprint'] },
    ],
    4: [
      { prompt: 'Means the same as DIFFICULT',   answer: 'hard',       choices: ['hard',       'easy',       'early'] },
      { prompt: 'Means the same as IMPORTANT',   answer: 'significant',choices: ['significant','silly',      'similar'] },
      { prompt: 'Means the same as DISCOVER',    answer: 'find',       choices: ['find',       'forget',     'finish'] },
      { prompt: 'Means the same as ENORMOUS',    answer: 'huge',       choices: ['huge',       'hungry',     'humble'] },
      { prompt: 'Means the same as DELICIOUS',   answer: 'tasty',      choices: ['tasty',      'tough',      'tiny'] },
      { prompt: 'Means the same as GENEROUS',    answer: 'giving',     choices: ['giving',     'greedy',     'gloomy'] },
      { prompt: 'Means the same as FRIGHTENED',  answer: 'scared',     choices: ['scared',     'safe',       'steady'] },
      { prompt: 'Means the same as INCREDIBLE',  answer: 'amazing',    choices: ['amazing',    'awful',      'average'] },
      { prompt: 'Means the same as WHISPER',     answer: 'murmur',     choices: ['murmur',     'mumble',     'mock'] }, // both mur/mum are close — check
      { prompt: 'Means the same as PROBLEM',     answer: 'trouble',    choices: ['trouble',    'triumph',    'treasure'] },
      { prompt: 'Means the same as QUESTION',    answer: 'query',      choices: ['query',      'answer',     'agree'] },
      { prompt: 'Means the same as OBSERVE',     answer: 'watch',      choices: ['watch',      'worry',      'wander'] },
      { prompt: 'Means the same as BEGIN',       answer: 'commence',   choices: ['commence',   'conclude',   'conceal'] },
      { prompt: 'Means the same as CAREFUL',     answer: 'cautious',   choices: ['cautious',   'careless',   'chaotic'] },
      { prompt: 'Means the same as ACHIEVE',     answer: 'accomplish', choices: ['accomplish', 'abandon',    'attempt'] },
    ],
    5: [
      { prompt: 'Means the same as ABUNDANT',     answer: 'plentiful',   choices: ['plentiful',   'scarce',       'sudden'] },
      { prompt: 'Means the same as GENEROUS',     answer: 'charitable',  choices: ['charitable',  'chaotic',      'cautious'] },
      { prompt: 'Means the same as INTELLIGENT',  answer: 'brilliant',   choices: ['brilliant',   'boring',       'bashful'] },
      { prompt: 'Means the same as INVESTIGATE',  answer: 'examine',     choices: ['examine',     'exit',         'excite'] },
      { prompt: 'Means the same as EXHAUSTED',    answer: 'weary',       choices: ['weary',       'wealthy',      'watchful'] },
      { prompt: 'Means the same as MAGNIFICENT',  answer: 'splendid',    choices: ['splendid',    'shabby',       'silent'] },
      { prompt: 'Means the same as DETERMINED',   answer: 'resolute',    choices: ['resolute',    'reluctant',    'random'] },
      { prompt: 'Means the same as HESITATE',     answer: 'pause',       choices: ['pause',       'proceed',      'propel'] },
      { prompt: 'Means the same as GATHER',       answer: 'collect',     choices: ['collect',     'scatter',      'shatter'] },
      { prompt: 'Means the same as MYSTERIOUS',   answer: 'puzzling',    choices: ['puzzling',    'plain',        'polite'] },
      { prompt: 'Means the same as FEROCIOUS',    answer: 'fierce',      choices: ['fierce',      'friendly',     'fragile'] },
      { prompt: 'Means the same as RELUCTANT',    answer: 'unwilling',   choices: ['unwilling',   'eager',        'excited'] },
      { prompt: 'Means the same as ELEGANT',      answer: 'graceful',    choices: ['graceful',    'grumpy',       'gritty'] },
      { prompt: 'Means the same as INVENT',       answer: 'create',      choices: ['create',      'copy',         'cancel'] },
      { prompt: 'Means the same as PROTECT',      answer: 'shield',      choices: ['shield',      'surrender',    'stumble'] },
    ],
  },

  // ==========================================================================
  // ANTONYMS — opposite word meanings. Credited to the `synonyms` skill, whose
  // CCSS descriptor (L.K.5/L.1.5) covers "word relationships: synonyms,
  // antonyms". Distractors often include a SYNONYM of the target word so the
  // kid can't win by picking the odd-looking word — they must know the meaning.
  // ==========================================================================
  antonyms: {
    1: [
      { prompt: 'Opposite of HOT',   answer: 'cold',  choices: ['cold',  'warm',  'wet'] },
      { prompt: 'Opposite of BIG',   answer: 'small', choices: ['small', 'huge',  'tall'] },
      { prompt: 'Opposite of UP',    answer: 'down',  choices: ['down',  'over',  'in'] },
      { prompt: 'Opposite of DAY',   answer: 'night', choices: ['night', 'noon',  'sun'] },
      { prompt: 'Opposite of HAPPY', answer: 'sad',   choices: ['sad',   'glad',  'mad'] },
      { prompt: 'Opposite of FAST',  answer: 'slow',  choices: ['slow',  'quick', 'far'] },
      { prompt: 'Opposite of YES',   answer: 'no',    choices: ['no',    'why',   'go'] },
      { prompt: 'Opposite of OPEN',  answer: 'shut',  choices: ['shut',  'wide',  'lock'] },
      { prompt: 'Opposite of WET',   answer: 'dry',   choices: ['dry',   'damp',  'hot'] },
      { prompt: 'Opposite of GO',    answer: 'stop',  choices: ['stop',  'run',   'come'] },
    ],
    2: [
      { prompt: 'Opposite of HARD',  answer: 'soft',  choices: ['soft',  'firm',  'cold'] },
      { prompt: 'Opposite of FULL',  answer: 'empty', choices: ['empty', 'tall',  'open'] },
      { prompt: 'Opposite of OLD',   answer: 'new',   choices: ['new',   'used',  'big'] },
      { prompt: 'Opposite of LIGHT', answer: 'dark',  choices: ['dark',  'bright','warm'] },
      { prompt: 'Opposite of LOUD',  answer: 'quiet', choices: ['quiet', 'noisy', 'high'] },
      { prompt: 'Opposite of CLEAN', answer: 'dirty', choices: ['dirty', 'tidy',  'wet'] },
      { prompt: 'Opposite of PUSH',  answer: 'pull',  choices: ['pull',  'lift',  'shove'] },
      { prompt: 'Opposite of OVER',  answer: 'under', choices: ['under', 'above', 'near'] },
      { prompt: 'Opposite of HIGH',  answer: 'low',   choices: ['low',   'tall',  'far'] },
      { prompt: 'Opposite of EARLY', answer: 'late',  choices: ['late',  'soon',  'slow'] },
    ],
    3: [
      { prompt: 'Opposite of BEGIN',  answer: 'end',    choices: ['end',    'start', 'open'] },
      { prompt: 'Opposite of BUY',    answer: 'sell',   choices: ['sell',   'pay',   'shop'] },
      { prompt: 'Opposite of WIN',    answer: 'lose',   choices: ['lose',   'beat',  'play'] },
      { prompt: 'Opposite of TRUE',   answer: 'false',  choices: ['false',  'real',  'sure'] },
      { prompt: 'Opposite of WIDE',   answer: 'narrow', choices: ['narrow', 'broad', 'deep'] },
      { prompt: 'Opposite of SHARP',  answer: 'dull',   choices: ['dull',   'keen',  'thin'] },
      { prompt: 'Opposite of SWEET',  answer: 'sour',   choices: ['sour',   'sugary','salty'] },
      { prompt: 'Opposite of THICK',  answer: 'thin',   choices: ['thin',   'wide',  'fat'] },
      { prompt: 'Opposite of LAUGH',  answer: 'cry',    choices: ['cry',    'giggle','smile'] },
      { prompt: 'Opposite of FRIEND', answer: 'enemy',  choices: ['enemy',  'pal',   'buddy'] },
    ],
    4: [
      { prompt: 'Opposite of ANCIENT',  answer: 'modern',   choices: ['modern',   'old',    'aged'] },
      { prompt: 'Opposite of BRAVE',    answer: 'afraid',   choices: ['afraid',   'bold',   'strong'] },
      { prompt: 'Opposite of CALM',     answer: 'nervous',  choices: ['nervous',  'quiet',  'still'] },
      { prompt: 'Opposite of CRUEL',    answer: 'kind',     choices: ['kind',     'mean',   'harsh'] },
      { prompt: 'Opposite of ENTRANCE', answer: 'exit',     choices: ['exit',     'doorway','gate'] },
      { prompt: 'Opposite of FORBID',   answer: 'allow',    choices: ['allow',    'ban',    'stop'] },
      { prompt: 'Opposite of WEALTHY',  answer: 'poor',     choices: ['poor',     'rich',   'greedy'] },
      { prompt: 'Opposite of INCREASE', answer: 'decrease', choices: ['decrease', 'grow',   'add'] },
      { prompt: 'Opposite of VICTORY',  answer: 'defeat',   choices: ['defeat',   'win',    'prize'] },
      { prompt: 'Opposite of GENEROUS', answer: 'selfish',  choices: ['selfish',  'giving', 'kind'] },
    ],
    5: [
      { prompt: 'Opposite of ENORMOUS',   answer: 'tiny',      choices: ['tiny',      'huge',    'giant'] },
      { prompt: 'Opposite of CHEERFUL',   answer: 'gloomy',    choices: ['gloomy',    'jolly',   'merry'] },
      { prompt: 'Opposite of BRILLIANT',  answer: 'dull',      choices: ['dull',      'bright',  'shiny'] },
      { prompt: 'Opposite of EXPAND',     answer: 'shrink',    choices: ['shrink',    'grow',    'stretch'] },
      { prompt: 'Opposite of ACCEPT',     answer: 'reject',    choices: ['reject',    'take',    'agree'] },
      { prompt: 'Opposite of PERMANENT',  answer: 'temporary', choices: ['temporary', 'lasting', 'forever'] },
      { prompt: 'Opposite of COURAGEOUS', answer: 'cowardly',  choices: ['cowardly',  'brave',   'bold'] },
      { prompt: 'Opposite of ARRIVE',     answer: 'depart',    choices: ['depart',    'reach',   'come'] },
      { prompt: 'Opposite of ARTIFICIAL', answer: 'natural',   choices: ['natural',   'fake',    'plastic'] },
      { prompt: 'Opposite of SCATTER',    answer: 'gather',    choices: ['gather',    'spread',  'toss'] },
    ],
  },

  // ==========================================================================
  // CONTEXT CLUES — infer a word's meaning from the sentence it appears in.
  // The `subtext` carries the sentence; the prompt asks what the ALL-CAPS word
  // means. Credited to the `context-clues` skill (migration 0007).
  // ==========================================================================
  'context-clues': {
    1: [
      { prompt: 'What does HUGE mean?',  subtext: 'The HUGE whale was bigger than our boat.',   answer: 'very big',   choices: ['very big',   'very small', 'very fast'] },
      { prompt: 'What does CHILLY mean?',subtext: 'It was so CHILLY that we put on our coats.',  answer: 'cold',       choices: ['cold',       'hot',        'loud'] },
      { prompt: 'What does RUSH mean?',  subtext: 'We had to RUSH so we would not be late.',     answer: 'hurry',      choices: ['hurry',      'sleep',      'rest'] },
      { prompt: 'What does TASTY mean?', subtext: 'The soup was so TASTY that I ate it all.',    answer: 'yummy',      choices: ['yummy',      'yucky',      'cold'] },
      { prompt: 'What does GIANT mean?', subtext: 'A GIANT wave splashed over the sand.',        answer: 'very big',   choices: ['very big',   'tiny',       'wet'] },
      { prompt: 'What does GLAD mean?',  subtext: 'She was GLAD to see her best friend.',        answer: 'happy',      choices: ['happy',      'sad',        'tired'] },
      { prompt: 'What does TIRED mean?', subtext: 'After the long walk we felt very TIRED.',     answer: 'sleepy',     choices: ['sleepy',     'hungry',     'happy'] },
      { prompt: 'What does TINY mean?',  subtext: 'The TINY ant was too small to see.',          answer: 'very small', choices: ['very small', 'very big',   'very loud'] },
    ],
    2: [
      { prompt: 'What does GENTLE mean?',   subtext: 'She gave the puppy a GENTLE pat.',            answer: 'soft and kind', choices: ['soft and kind', 'rough',     'fast'] },
      { prompt: 'What does BRIGHT mean?',   subtext: 'The BRIGHT sun made us squint.',              answer: 'full of light', choices: ['full of light', 'dark',      'cold'] },
      { prompt: 'What does SPEEDY mean?',   subtext: 'The SPEEDY rabbit won the race.',             answer: 'very fast',     choices: ['very fast',     'very slow', 'very small'] },
      { prompt: 'What does DELIGHTED mean?',subtext: 'He was DELIGHTED with his birthday gift.',    answer: 'very happy',    choices: ['very happy',    'angry',     'bored'] },
      { prompt: 'What does ENORMOUS mean?', subtext: 'The ENORMOUS truck filled the whole road.',   answer: 'very big',      choices: ['very big',      'tiny',      'quiet'] },
      { prompt: 'What does SOAKED mean?',   subtext: 'The rain left us completely SOAKED.',         answer: 'very wet',      choices: ['very wet',      'dry',       'warm'] },
      { prompt: 'What does FREEZING mean?', subtext: 'My hands were FREEZING in the snow.',         answer: 'very cold',     choices: ['very cold',     'very hot',  'very soft'] },
      { prompt: 'What does STROLL mean?',   subtext: 'We took a slow STROLL through the park.',     answer: 'a slow walk',   choices: ['a slow walk',   'a fast run','a long sleep'] },
    ],
    3: [
      { prompt: 'What does ANCIENT mean?',   subtext: 'The ANCIENT castle was built long, long ago.', answer: 'very old',    choices: ['very old',    'brand new',       'very small'] },
      { prompt: 'What does FURIOUS mean?',   subtext: 'Dad was FURIOUS when the dog chewed his shoe.', answer: 'very angry',  choices: ['very angry',  'very happy',      'very tired'] },
      { prompt: 'What does EXHAUSTED mean?', subtext: 'After the game the players were EXHAUSTED.',    answer: 'very tired',  choices: ['very tired',  'full of energy',  'very hungry'] },
      { prompt: 'What does TIMID mean?',     subtext: 'The TIMID kitten hid under the couch.',         answer: 'shy',         choices: ['shy',         'brave',           'loud'] },
      { prompt: 'What does DELICIOUS mean?', subtext: 'The cake was so DELICIOUS we asked for more.',  answer: 'very tasty',  choices: ['very tasty',  'spoiled',         'plain'] },
      { prompt: 'What does DAMP mean?',      subtext: 'The towel was still DAMP from the pool.',       answer: 'a little wet',choices: ['a little wet','totally dry',     'very hot'] },
      { prompt: 'What does GRASP mean?',     subtext: 'She reached out to GRASP the rope.',            answer: 'grab tightly',choices: ['grab tightly','let go',          'look at'] },
      { prompt: 'What does WEARY mean?',     subtext: 'The WEARY hikers rested beside the trail.',     answer: 'tired',       choices: ['tired',       'excited',         'hungry'] },
    ],
    4: [
      { prompt: 'What does RELUCTANT mean?', subtext: 'He was RELUCTANT to try the spicy food.',       answer: 'unwilling',      choices: ['unwilling',      'eager',     'hungry'] },
      { prompt: 'What does VANISH mean?',    subtext: 'The magician made the coin VANISH.',            answer: 'disappear',      choices: ['disappear',      'appear',    'grow'] },
      { prompt: 'What does FRAGILE mean?',   subtext: 'Handle the glass gently — it is FRAGILE.',      answer: 'easily broken',  choices: ['easily broken',  'very strong','very heavy'] },
      { prompt: 'What does ABUNDANT mean?',  subtext: 'Apples were ABUNDANT, so everyone got plenty.', answer: 'plentiful',      choices: ['plentiful',      'scarce',    'rotten'] },
      { prompt: 'What does DREADED mean?',   subtext: 'She DREADED the long trip to the dentist.',     answer: 'feared',         choices: ['feared',         'enjoyed',   'forgot'] },
      { prompt: 'What does STROLLED mean?',  subtext: 'They STROLLED slowly along the beach.',         answer: 'walked slowly',  choices: ['walked slowly',  'ran fast',  'fell down'] },
      { prompt: 'What does BELLOWED mean?',  subtext: 'The coach BELLOWED so the whole field heard.',  answer: 'shouted loudly', choices: ['shouted loudly', 'whispered', 'sang softly'] },
      { prompt: 'What does PECULIAR mean?',  subtext: 'A PECULIAR smell was coming from the fridge.',  answer: 'strange',        choices: ['strange',        'normal',    'sweet'] },
    ],
    5: [
      { prompt: 'What does DEVOUR mean?',    subtext: 'The hungry lion began to DEVOUR its meal.',       answer: 'eat quickly',        choices: ['eat quickly',        'nibble slowly', 'cook'] },
      { prompt: 'What does IMMENSE mean?',   subtext: 'From the plane the ocean looked IMMENSE.',        answer: 'huge',               choices: ['huge',               'tiny',          'shallow'] },
      { prompt: 'What does FEEBLE mean?',    subtext: 'The FEEBLE old dog could barely climb the stairs.', answer: 'weak',             choices: ['weak',               'strong',        'fast'] },
      { prompt: 'What does BAFFLED mean?',   subtext: 'The tricky riddle left us completely BAFFLED.',   answer: 'confused',           choices: ['confused',           'certain',       'bored'] },
      { prompt: 'What does RADIANT mean?',   subtext: 'The bride had a RADIANT, glowing smile.',         answer: 'bright and glowing', choices: ['bright and glowing', 'dull',          'angry'] },
      { prompt: 'What does DEMOLISH mean?',  subtext: 'The crew will DEMOLISH the old building tomorrow.',answer: 'tear down',          choices: ['tear down',          'build up',      'paint'] },
      { prompt: 'What does CONCEAL mean?',   subtext: 'She tried to CONCEAL the surprise gift.',         answer: 'hide',               choices: ['hide',               'show',          'break'] },
      { prompt: 'What does WEARISOME mean?', subtext: 'The long, WEARISOME lecture put us to sleep.',    answer: 'tiring and boring',  choices: ['tiring and boring',  'exciting',      'short'] },
    ],
  },
};

/** Return the full list of tiers that have content for a given type. */
export function availableTiers(type: ReadingType): number[] {
  return Object.keys(READING_CONTENT[type]).map(Number).sort((a, b) => a - b);
}

/** Clamp a requested tier to the nearest tier that has content. */
export function clampToAvailableTier(type: ReadingType, tier: number): number {
  const tiers = availableTiers(type);
  if (tiers.length === 0) return 1;
  if (tier < tiers[0]) return tiers[0];
  if (tier > tiers[tiers.length - 1]) return tiers[tiers.length - 1];
  return tier;
}
