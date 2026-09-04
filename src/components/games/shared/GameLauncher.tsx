'use client';

// GameLauncher — shared pre-game screen for all calibrated games.
//
// Shown between the map and the actual gameplay. Gives the kid agency:
//   1. Pick a LEVEL (1–10, matching our tier system). Their current
//      level from kid_skills is highlighted; they can play at or above.
//   2. Pick a MATH TYPE (addition, subtraction, multiplication, mixed).
//      This maps to the `op` parameter in generateMathChallenge.
//
// Once both are chosen and the kid taps "Play!", the launcher calls
// `onStart({ level, mathType })` and the parent page swaps in the
// actual game component with those settings.
//
// Visual: Gamecakes branded, game-themed background, big level buttons
// in a grid, dropdown for math type, large Play button.

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import GamecakesLogo from '@/components/GamecakesLogo';
import {
  READING_KINDS,
  isReadingChallengeType,
  type ReadingChallengeType,
} from '@/lib/games/shared/generate-reading-challenge';
import GamecakesMascot from '@/components/GamecakesMascot';
import { ChromeNavLink } from '@/components/ui/ChromeNavLink';
import { resolveGameBackTarget } from '@/lib/games/back-nav';
import {
  DURATION_CHOICES,
  DEFAULT_DURATION_MIN,
  setSessionDuration,
  type DurationMin,
} from '@/lib/games/session-duration';
import { isMathKind, type QuestionMode, type MathKind } from '@/lib/games/shared/challenge-mode';
import type { MathType as GeneratedMathType } from '@/lib/games/shared/generate-challenge';
import { cakeyRecommends, type KidFocus } from '@/lib/games/shared/recommend';
import { setClassLists, type ClassWordList } from '@/lib/games/shared/focus-words';
import SugarTokenIcon from '@/components/wallet/SugarTokenIcon';

/** How many levels above the kid's best tier stay selectable. Generous
 *  on purpose — see the isLocked comment in the level grid below. */
export const UNLOCK_GRACE = 4;

/** Alias, NOT a copy — same reasoning as ReadingType below. This was a
 *  hand-written union, so adding 'division' to the generator left the
 *  launcher silently unable to offer it. */
export type MathType = GeneratedMathType;

/** Alias, NOT a copy. This used to be a hand-maintained union listing the five
 *  reading types, which meant adding a type to the content library left the
 *  launcher silently unable to offer it. Aliasing makes the compiler flag any
 *  new type that has no picker entry. */
export type ReadingType = ReadingChallengeType;
export type Difficulty = 'easy' | 'medium' | 'hard';
export type Controls = 'tap' | 'drag';
/** Which renderer a dual-view game should draw with. '3d' is the branded
 *  scene; '2d' is the flat classic board (and the low-power option — the 2D
 *  path loads no WebGL at all). */
export type GameView = '3d' | '2d';

export interface LaunchSettings {
  level: number;
  /** Which question set the round uses. 'math' (default) or 'verbal'
   *  (vocabulary/reading). In verbal mode the word kind lives in `readingType`.
   *  Only meaningful when the launcher was rendered with `showVerbalMode`; math
   *  shells read it to build sceneProps + attemptMeta. See challenge-mode.ts. */
  mode: QuestionMode;
  /** Set when the launcher was used for a math game. Either an arithmetic
   *  operation or one of the concept domains (shapes, time & money, …) —
   *  see MathKind. */
  mathType?: MathKind;
  /** Set when the launcher was used for a reading game. */
  readingType?: ReadingType;
  /** Game-feel preset. Only present when the launcher was rendered with
   *  `showDifficulty`. Games that opt out ignore this. */
  difficulty?: Difficulty;
  /** Input scheme. Only present when `showControls` is on. Games read
   *  this to swap between tap-to-flap and drag-to-steer, etc. */
  controls?: Controls;
  /** Which renderer a dual-view game should draw with. Only present when
   *  `showView` is on. */
  view?: GameView;
  /** Chosen play length in minutes (1/2/3). Present whenever the duration
   *  picker is shown. Also mirrored into the session-duration singleton on
   *  Play, which is what the game hosts + attempts POST actually read. */
  duration?: DurationMin;
}

export interface GameLauncherProps {
  /** Game title shown in the launcher header. */
  gameTitle: string;
  /** Emoji glyph for the game. */
  gameGlyph: string;
  /** Short description of the game. */
  gameDescription: string;
  /** The kid's current tier for the game's own skill. Highlighted in
   *  the level grid as "your level" and used as the default selection. */
  currentTier: number;
  /** Highest tier the kid has reached anywhere in the subject (see
   *  lib/mastery/launcher-tiers.ts) — drives unlocking. Defaults to
   *  currentTier if not provided. */
  highestTier?: number;
  /** Called when the kid taps Play. The parent page uses these settings
   *  to configure the game component. */
  onStart: (settings: LaunchSettings) => void;
  /** Background accent color class for the card. */
  accentBg?: string;
  /** Kid's name for personalization. */
  kidName?: string;
  /** Which subject's type picker to show. Defaults to 'math' for
   *  backwards compatibility. Reading games pass 'reading'.
   *
   *  'logic' behaves exactly like 'math' here — every branch below tests only
   *  for 'reading' — but it lets the chess games declare what they actually are
   *  instead of claiming to be arithmetic. If you ever add a logic-specific
   *  branch, note the two chess shells are the only callers passing it. */
  subject?: 'math' | 'reading' | 'logic';
  /** What the LEVEL axis actually scales, for the "Higher = harder ___"
   *  hint under the grid. Defaults to the subject noun (math/words). Games
   *  whose level means something other than the math/reading difficulty —
   *  e.g. Chess Puzzles, where it picks the PUZZLE difficulty — override it
   *  ("puzzles") so the hint doesn't mislabel the choice. */
  difficultyNoun?: string;
  /** Where the "← Map" link points. Defaults to the land-picker /map,
   *  but specific land pages override to /town or /town so
   *  the back-button stays inside the land. */
  backHref?: string;
  /** Label for the back link. Defaults to '← Map'; standalone contexts
   *  with no map (e.g. the /ba arcade) override to '← Back to menu'. */
  backLabel?: string;
  /** Render a per-level preview under the level grid — e.g. Word Memory
   *  shows the actual words in the selected list. When provided, this
   *  REPLACES the generic level-description blurb (the preview is
   *  strictly more informative). Re-invoked on every selection change. */
  levelPreview?: (level: number) => React.ReactNode;
  /** When true, render the Difficulty (easy/medium/hard) picker and
   *  include `difficulty` in the LaunchSettings payload. Games that
   *  don't care about physics tuning leave this off. */
  showDifficulty?: boolean;
  /** When true, skip the Problem/Word Type picker. Useful for games
   *  (e.g. Word Memory) where the "level" alone fully selects content. */
  hideTypePicker?: boolean;
  /** When true, all 10 levels are selectable regardless of the kid's
   *  current tier. Defaults to false (locks levels > maxReached + UNLOCK_GRACE).
   *  Word Memory uses this because the "list" is parent-assigned homework,
   *  not a skill to unlock. */
  unlockAllLevels?: boolean;
  /** When true, render the Controls picker (tap vs. drag) and include
   *  `controls` in the LaunchSettings payload. Flappy Math opts in so
   *  kids who prefer steering over flapping can pick that. */
  showControls?: boolean;
  /** Default Controls selection when `showControls` is on. 'tap' keeps
   *  older behavior stable for kids who've already learned that scheme. */
  defaultControls?: Controls;
  /** When true, render the View picker (3D scene vs 2D classic) and include
   *  `view` in the LaunchSettings payload. For games that ship both a 3D and a
   *  flat renderer over the same rules — the flat one is not a downgrade, it is
   *  a legibility and low-power choice some kids simply prefer. */
  showView?: boolean;
  /** Default View selection when `showView` is on. */
  defaultView?: GameView;
  /** Render the "How long?" 1/2/3-minute picker. On by default — every game
   *  is time-boxed now and the pick scales the cookie reward. A game can opt
   *  out (showDuration={false}) if it should never be timed. */
  showDuration?: boolean;
  /** Render the Math / Words mode toggle. Every math game opts in so the
   *  player can swap arithmetic questions for synonyms vocabulary. When the
   *  kid picks Words, the math-type picker hides and the level grid switches
   *  to the verbal tiers below. */
  showVerbalMode?: boolean;
  /** The kid's tier on the synonyms skill — the ★ marker / default level when
   *  Words mode is active. Defaults to 1. */
  verbalCurrentTier?: number;
  /** Best tier across the reading subject — unlocks levels in Words mode.
   *  Defaults to verbalCurrentTier. */
  verbalHighestTier?: number;
  /** Hide the concept band. Set by games whose gates are answered on a keypad
   *  and cannot render choice buttons — currently only the maze, whose gate
   *  type has no choice variant. */
  arithmeticOnly?: boolean;
  /** kids.grade (0 = K), nullable. Only used to build the "Cakey recommends"
   *  suggestion — the launcher works fine without it, the chip just doesn't
   *  appear for a kid with no grade and no play history. */
  kidGrade?: number | null;
  /** What a grown-up pinned for this kid on /parent, or null. Overrides the
   *  grade default inside cakeyRecommends(); null just leaves it alone. */
  kidFocus?: KidFocus | null;
  /** This kid's active class word lists, each whole and carrying the modes it
   *  was added for. Published to the focus-words singleton on Play, where the
   *  reading generator picks up the modes each list claims. */
  kidClassLists?: ClassWordList[];
}

const DURATION_LABELS: Record<DurationMin, { label: string; blurb: string; emoji: string }> = {
  1: { label: '1 min', blurb: 'Quick', emoji: '⚡' },
  2: { label: '2 min', blurb: 'Classic', emoji: '⏱️' },
  3: { label: '3 min', blurb: 'Marathon', emoji: '🔥' },
};

// Difficulty blurbs — kept game-agnostic. The picker used to be called
// "Flight Mode" with bird-coded emojis (🪶 🕊️) which made sense for
// Flappy but read as nonsense in Water Balloons, Marble Maze, Asteroids,
// etc. Generic emojis + "Difficulty" label so the same picker fits any
// game that opts in via showDifficulty.
const DIFFICULTIES: { value: Difficulty; label: string; emoji: string; blurb: string }[] = [
  { value: 'easy',   label: 'Easy',   emoji: '🐢', blurb: 'Slower & forgiving' },
  { value: 'medium', label: 'Medium', emoji: '⚖️', blurb: 'Balanced'           },
  { value: 'hard',   label: 'Hard',   emoji: '⚡', blurb: 'Fast & punchy'      },
];

const CONTROLS_OPTIONS: { value: Controls; label: string; emoji: string; blurb: string }[] = [
  { value: 'tap',  label: 'Tap',  emoji: '👆', blurb: 'Tap to flap'      },
  { value: 'drag', label: 'Drag', emoji: '🫳', blurb: 'Drag to steer'    },
];

const VIEW_OPTIONS: { value: GameView; label: string; emoji: string; blurb: string }[] = [
  { value: '3d', label: '3D',      emoji: '\u{1F382}', blurb: 'The full scene'  },
  { value: '2d', label: 'Classic', emoji: '\u{1F7E5}', blurb: 'Flat & speedy'   },
];

/** Math kinds, banded the way the reading picker already is.
 *
 *  Two bands, because they are genuinely two things: "Number facts" answer on
 *  the keypad, "Thinking" answer on choice buttons. The bands run in teaching
 *  order within themselves. Labels are kid-facing — "Bigger or smaller?", not
 *  "number comparison"; the standards mapping lives in mathSkillFor().
 *
 *  Division joined the first band and the whole second band arrived on
 *  2026-09-03: comparison, place value, skip counting, shapes and time/money
 *  had catalog rows and no way to be asked. */
const MATH_GROUPS: {
  heading: string;
  types: { value: MathKind; label: string; emoji: string }[];
}[] = [
  {
    heading: 'Number facts',
    types: [
      { value: 'addition',       label: 'Addition (+)',       emoji: '➕' },
      { value: 'subtraction',    label: 'Subtraction (−)',    emoji: '➖' },
      { value: 'multiplication', label: 'Multiplication (×)', emoji: '✖️' },
      { value: 'division',       label: 'Division (÷)',       emoji: '➗' },
    ],
  },
  {
    heading: 'Thinking',
    types: [
      { value: 'compare',     label: 'Bigger or smaller?', emoji: '⚖️' },
      { value: 'place-value', label: 'Tens and ones',      emoji: '🔟' },
      { value: 'skip-count',  label: 'Counting patterns',  emoji: '👣' },
      { value: 'shapes',      label: 'Shapes',             emoji: '🔺' },
      { value: 'time-money',  label: 'Time & money',       emoji: '🕒' },
    ],
  },
  {
    // Drawn questions. These are the ones that could not be asked at all until
    // ChoiceChallenge learned to carry a Figure — a cake cut into thirds is a
    // picture, not a sentence.
    heading: 'Pictures',
    types: [
      { value: 'fractions',   label: 'Fair shares',        emoji: '🍰' },
      { value: 'area',        label: 'Covering',           emoji: '🟧' },
    ],
  },
];

/** Word kinds, grouped by reading strand.
 *
 *  There are fourteen of these now. A flat two-column grid of fourteen
 *  buttons is a wall to a five-year-old, so they are banded by what the
 *  skill actually is — and the bands run in teaching order (sounds before
 *  words before meaning), so scanning down the list is scanning up the
 *  progression. 'Mixed' sits outside the bands as the default.
 *
 *  Labels are kid-facing, not curricular: "Rhymes", not "phonological
 *  awareness". The standards mapping lives in verbalSkillFor(). */
const READING_GROUPS: { heading: string; types: ReadingType[] }[] = [
  { heading: 'Sounds',    types: ['letter-sounds', 'syllables', 'rhyming'] },
  { heading: 'Words',     types: ['sight-words', 'word-building', 'spelling'] },
  { heading: 'Meanings',  types: ['word-meaning', 'synonyms', 'antonyms', 'context-clues', 'word-roots'] },
  { heading: 'Sentences', types: ['parts-of-speech', 'punctuation'] },
  { heading: 'Reading',   types: ['comprehension', 'figurative'] },
];

const MODE_OPTIONS: { value: QuestionMode; label: string; emoji: string; blurb: string }[] = [
  { value: 'math',   label: 'Math',  emoji: '🔢', blurb: 'Number problems' },
  { value: 'verbal', label: 'Words', emoji: '🔤', blurb: 'Vocabulary'      },
];

export default function GameLauncher({
  gameTitle,
  gameGlyph,
  gameDescription,
  currentTier,
  highestTier,
  onStart,
  accentBg = 'bg-sky-50 dark:bg-sky-950',
  kidName,
  subject = 'math',
  difficultyNoun,
  backHref = '/town',
  backLabel = '← Map',
  levelPreview,
  showDifficulty = false,
  hideTypePicker = false,
  unlockAllLevels = false,
  showControls = false,
  defaultControls = 'tap',
  showView = false,
  defaultView = '3d',
  showDuration = true,
  showVerbalMode = false,
  verbalCurrentTier,
  verbalHighestTier,
  kidGrade,
  kidFocus,
  kidClassLists,
  arithmeticOnly = false,
}: GameLauncherProps) {
  // Deep link (?op=…&level=…) — how a "practice this next" recommendation
  // hands the kid a launcher already set to the skill being recommended.
  // Without it the link landed on whatever the pickers happened to default to,
  // which for a division recommendation meant addition at the wrong level.
  // Read once as initial state so the kid can still change their mind.
  const searchParams = useSearchParams();
  const paramOp = searchParams.get('op');
  const paramLevel = Number(searchParams.get('level'));
  const deepLevel =
    Number.isInteger(paramLevel) && paramLevel >= 1 && paramLevel <= 10
      ? paramLevel
      : null;

  const [selectedLevel, setSelectedLevel] = useState(deepLevel ?? currentTier ?? 1);
  const [mathType, setMathType] = useState<MathKind>(
    isMathKind(paramOp) ? paramOp : 'addition',
  );
  const [readingType, setReadingType] = useState<ReadingType>(
    isReadingChallengeType(paramOp) ? paramOp : 'mixed',
  );
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [controls, setControls] = useState<Controls>(defaultControls);
  const [view, setView] = useState<GameView>(defaultView);
  const [duration, setDuration] = useState<DurationMin>(DEFAULT_DURATION_MIN);
  // A ?op= naming a word kind is also a request for Words mode — the link
  // knows which subject it meant, and landing on the math tab would drop it.
  const [mode, setMode] = useState<QuestionMode>(
    isReadingChallengeType(paramOp) && !isMathKind(paramOp) ? 'verbal' : 'math',
  );
  // In verbal mode the type picker chooses the word kind (synonyms / rhymes /
  // sight words / mixed). `readingType` state is shared with reading games.
  const showReadingPicker = subject === 'reading' || mode === 'verbal';

  // In Words mode the level axis means the SYNONYMS tier, not the math one,
  // so the ★ marker, unlocking, and default selection all follow the verbal
  // tiers. Everything below reads these `active*` values instead of the raw
  // props so one grid serves both modes.
  const verbalCurrent = verbalCurrentTier || 1;
  const activeCurrent = mode === 'verbal' ? verbalCurrent : (currentTier || 1);
  const maxReached =
    mode === 'verbal'
      ? (verbalHighestTier ?? verbalCurrent)
      : (highestTier ?? currentTier ?? 1);

  // Switching mode re-defaults the selected level to that mode's own tier —
  // a kid on synonyms-tier-2 shouldn't land on their math-tier-8 level.
  // Adjusted during render (not in an effect) so the grid never paints a
  // stale selection for a frame.
  const [seenMode, setSeenMode] = useState(mode);
  if (mode !== seenMode) {
    setSeenMode(mode);
    setSelectedLevel(mode === 'verbal' ? verbalCurrent : (currentTier || 1));
  }

  // Cakey's suggestion for the ACTIVE mode — grade-anchored, never locked,
  // never a step backwards. Recomputed on mode switch so the chip always
  // describes the questions the kid is actually about to get.
  const cakeyPick = cakeyRecommends({
    mode: showReadingPicker ? 'verbal' : 'math',
    grade: kidGrade ?? null,
    currentTier: activeCurrent,
    maxReached,
    focus: kidFocus ?? null,
  });
  const cakeyApplied =
    cakeyPick != null &&
    selectedLevel === cakeyPick.level &&
    (showReadingPicker
      ? readingType === cakeyPick.readingType
      : mathType === cakeyPick.mathType);

  const applyCakeyPick = () => {
    if (!cakeyPick) return;
    setSelectedLevel(cakeyPick.level);
    if (cakeyPick.readingType) setReadingType(cakeyPick.readingType);
    if (cakeyPick.mathType) setMathType(cakeyPick.mathType);
  };

  // If the kid reached this game from the All Games menu (/games?from=…),
  // send the back link there instead of the default /town. Falls back to
  // the caller-supplied backHref/backLabel when there's no override.
  const backOverride = resolveGameBackTarget(searchParams.get('from'));
  const resolvedBackHref = backOverride?.href ?? backHref;
  const resolvedBackLabel = backOverride?.label ?? backLabel;

  return (
    <main className="flex flex-1 flex-col items-center p-4 sm:p-6">
      {/* Header */}
      <header className="flex w-full max-w-lg items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <GamecakesLogo size={40} />
          <div>
            <h1 className="text-2xl font-bold">{gameTitle}</h1>
            <p className="text-xs text-zinc-500">{gameDescription}</p>
          </div>
        </div>
        {/* Back link — the unified chrome pill, not an ad-hoc bordered
            Link (this was the last holdout from before ChromeNavLink
            existed). `shrink-0` so long labels ("← Back to menu") never
            squash against the title block. */}
        <ChromeNavLink href={resolvedBackHref} size="sm" className="shrink-0">
          {resolvedBackLabel}
        </ChromeNavLink>
      </header>

      {/* Game preview card — the game's glyph plus Cakey, so the brand
          mascot greets the kid on every game's pre-screen, not just /kids. */}
      <div className={`mt-6 w-full max-w-lg rounded-3xl ${accentBg} p-6 text-center shadow-lg`}>
        <div className="text-7xl">{gameGlyph}</div>
        <div className="mt-3 flex items-center justify-center gap-2">
          <GamecakesMascot mood="happy" size={48} />
          <p className="font-display text-sm font-medium text-zinc-600 dark:text-zinc-400">
            {kidName ? `${kidName}, choose your challenge!` : 'Choose your challenge!'}
          </p>
        </div>
      </div>

      {/* Cakey recommends — one tap that sets level + question kind to the
          work this kid's grade is doing in school right now. Sits above every
          picker because it exists to let a kid skip all of them; the pickers
          stay exactly where they were for anyone who'd rather choose.
          Hidden when the level grid isn't a difficulty axis (unlockAllLevels
          games like Word Memory pick a parent-assigned list, not a tier). */}
      {cakeyPick && !unlockAllLevels ? (
        <section className="mt-6 w-full max-w-lg">
          <button
            type="button"
            onClick={applyCakeyPick}
            aria-pressed={cakeyApplied}
            className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all ${
              cakeyApplied
                ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950 shadow-md'
                : 'bg-white text-zinc-700 shadow-sm hover:shadow-md active:scale-95 dark:bg-zinc-800 dark:text-zinc-200'
            }`}
            style={{ minHeight: 'var(--min-tap-target)' }}
          >
            <GamecakesMascot mood="happy" size={40} />
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-semibold uppercase tracking-wider opacity-70">
                Cakey recommends
              </span>
              <span className="block text-sm font-semibold">{cakeyPick.headline}</span>
              <span className={`block text-xs ${cakeyApplied ? 'text-amber-900' : 'text-zinc-400'}`}>
                {cakeyPick.reason}
              </span>
            </span>
            <span className="shrink-0 text-xs font-bold uppercase tracking-wide">
              {cakeyApplied ? 'Set ✓' : 'Use it'}
            </span>
          </button>
        </section>
      ) : null}

      {/* Question mode — opt-in per game via showVerbalMode. Lets the kid
          swap arithmetic for synonyms vocabulary while keeping the same game.
          Placed above Level because it changes what the level axis means. */}
      {showVerbalMode ? (
        <section className="mt-6 w-full max-w-lg">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Question type
          </h2>
          <p className="mt-1 text-xs text-zinc-400">
            Same game — solve math, or match words.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {MODE_OPTIONS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                aria-pressed={mode === m.value}
                className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-3 text-sm font-medium transition-all ${
                  mode === m.value
                    ? 'bg-gradient-to-b from-violet-400 to-violet-600 text-white shadow-md scale-105'
                    : 'bg-white text-zinc-700 shadow-sm hover:shadow-md active:scale-95 dark:bg-zinc-800 dark:text-zinc-300'
                }`}
                style={{ minHeight: 'var(--min-tap-target)' }}
              >
                <span className="text-xl">{m.emoji}</span>
                <span>{m.label}</span>
                <span className={`text-[10px] ${mode === m.value ? 'text-violet-50' : 'text-zinc-400'}`}>
                  {m.blurb}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* Level selection */}
      <section className="mt-6 w-full max-w-lg">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
          {unlockAllLevels ? 'Pick a List' : 'How tricky?'}
        </h2>
        {unlockAllLevels ? null : (
          <p className="mt-1 text-xs text-zinc-400">
            You&rsquo;re on {activeCurrent}. Higher = harder{' '}
            {mode === 'verbal'
              ? 'vocabulary'
              : (difficultyNoun ?? (subject === 'reading' ? 'words' : 'math'))}.
          </p>
        )}

        <div className="mt-3 grid grid-cols-5 gap-2">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((lvl) => {
            const isCurrent = lvl === activeCurrent;
            const isSelected = lvl === selectedLevel;
            // Games that opt in (e.g. Word Memory, where the "list" is a
            // parent-assigned homework pick) let the kid select any level.
            //
            // UNLOCK_GRACE: kids may reach UP TO 4 levels above their best
            // tier. Trying something too hard is low-stakes here — the
            // worst case is a tough session and picking a lower level next
            // time, and stretching by choice is how kids find their edge.
            // The lock exists only so a kindergartner doesn't land in
            // multiplication by accident, not to meter out progress.
            const isLocked = unlockAllLevels ? false : lvl > maxReached + UNLOCK_GRACE;

            return (
              <button
                key={lvl}
                type="button"
                disabled={isLocked}
                onClick={() => setSelectedLevel(lvl)}
                className={`relative flex flex-col items-center justify-center rounded-2xl py-3 text-lg font-bold transition-all ${
                  isSelected
                    ? 'bg-gradient-to-b from-emerald-400 to-emerald-600 text-white shadow-lg scale-105'
                    : isLocked
                      ? 'bg-zinc-100 text-zinc-300 dark:bg-zinc-900 dark:text-zinc-700'
                      : 'bg-white text-zinc-800 shadow-sm hover:shadow-md hover:scale-105 active:scale-95 dark:bg-zinc-800 dark:text-zinc-200'
                }`}
                style={{ minHeight: 'var(--min-tap-target)' }}
              >
                {isLocked ? '🔒' : lvl}
                {/* ★ marks "your tier" — hide it when any level is pickable,
                    because the kid's DB tier is irrelevant to the choice. */}
                {!unlockAllLevels && isCurrent && !isSelected ? (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[8px] font-bold text-amber-900">
                    ★
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Per-game preview of the selected level (e.g. Word Memory's
            actual word list) when provided — otherwise the generic
            subject-aware description blurb. */}
        {levelPreview ? (
          levelPreview(selectedLevel)
        ) : (
        <div className="mt-3 rounded-xl bg-white/80 px-4 py-2 text-center text-xs text-zinc-600 dark:bg-zinc-900/80 dark:text-zinc-400">
          {mode === 'verbal'
            ? (
              <>
                {selectedLevel <= 2 && 'Everyday words & rhymes. Great for K/1st.'}
                {selectedLevel >= 3 && selectedLevel <= 4 && 'Richer vocabulary & word pairs. 1st–2nd grade.'}
                {selectedLevel >= 5 && 'The toughest words (abundant → plentiful).'}
              </>
            ) : subject === 'reading'
            ? (
              <>
                {selectedLevel <= 2 && 'Short everyday sight words. Great for K/1st.'}
                {selectedLevel >= 3 && selectedLevel <= 5 && 'Tricky pairs & doubles. Early 1st grade vibes.'}
                {selectedLevel >= 6 && selectedLevel <= 7 && 'Action & question words. More to remember!'}
                {selectedLevel >= 8 && selectedLevel <= 9 && 'Contractions & connecting words. 2nd-grade territory.'}
                {selectedLevel === 10 && 'Two-syllable words. The toughest list!'}
              </>
            ) : (
              <>
                {/* Rewritten 2026-09-03 with the tier ladder. These blurbs are the
                    only place a kid finds out what a level MEANS, so they rot
                    loudly: they described multiplication at 8-9 for a week after
                    it moved to 6-7. Keep them in step with generate-challenge.ts. */}
                {selectedLevel <= 2 && 'Small numbers. Adding and taking away.'}
                {selectedLevel === 3 && 'Up to 20. Getting trickier!'}
                {selectedLevel >= 4 && selectedLevel <= 5 && 'Double digits! Big kid math.'}
                {selectedLevel >= 6 && selectedLevel <= 7 && 'Times tables and sharing out.'}
                {selectedLevel >= 8 && selectedLevel <= 9 && 'Really big numbers.'}
                {selectedLevel === 10 && 'The ultimate mix. Everything thrown at you!'}
              </>
            )}
        </div>
        )}
      </section>

      {/* Type selector — word kinds when reading OR in Words mode, else math
          kinds. Hidden only when `hideTypePicker` is set (e.g. Word Memory,
          where the level alone selects all content). */}
      {hideTypePicker ? null : (
      <section className="mt-6 w-full max-w-lg">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
          {showReadingPicker ? 'Word kind' : 'Math kind'}
        </h2>
        {showReadingPicker ? (
          <>
            {/* Mixed first and full-width: it is the default and the one most
                kids want, so it should not be hunted for inside a band. */}
            <button
              type="button"
              onClick={() => setReadingType('mixed')}
              className={`mt-3 flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition-all ${
                readingType === 'mixed'
                  ? 'bg-gradient-to-r from-sky-400 to-sky-500 text-white shadow-md'
                  : 'bg-white text-zinc-700 shadow-sm hover:shadow-md active:scale-95 dark:bg-zinc-800 dark:text-zinc-300'
              }`}
              style={{ minHeight: 'var(--min-tap-target)' }}
            >
              <span className="text-lg">🔀</span>
              <span>Mixed — a bit of everything</span>
            </button>

            {READING_GROUPS.map((group) => (
              <div key={group.heading} className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  {group.heading}
                </h3>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {group.types.map((rt) => (
                    <button
                      key={rt}
                      type="button"
                      onClick={() => setReadingType(rt)}
                      className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition-all ${
                        readingType === rt
                          ? 'bg-gradient-to-r from-sky-400 to-sky-500 text-white shadow-md'
                          : 'bg-white text-zinc-700 shadow-sm hover:shadow-md active:scale-95 dark:bg-zinc-800 dark:text-zinc-300'
                      }`}
                      style={{ minHeight: 'var(--min-tap-target)' }}
                    >
                      <span className="text-lg">{READING_KINDS[rt].emoji}</span>
                      <span>{READING_KINDS[rt].label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        ) : (
        <>
          {/* Mixed first and full-width, exactly as on the reading side: it is
              the default and the one most kids want. */}
          <button
            type="button"
            onClick={() => setMathType('mixed')}
            className={`mt-3 flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition-all ${
              mathType === 'mixed'
                ? 'bg-gradient-to-r from-rose-400 to-rose-500 text-white shadow-md'
                : 'bg-white text-zinc-700 shadow-sm hover:shadow-md active:scale-95 dark:bg-zinc-800 dark:text-zinc-300'
            }`}
            style={{ minHeight: 'var(--min-tap-target)' }}
          >
            <span className="text-lg">🔀</span>
            <span>Mixed — a bit of everything</span>
          </button>

          {MATH_GROUPS.filter(
            (g) => !(arithmeticOnly && g.heading === 'Thinking'),
          ).map((group) => (
            <div key={group.heading} className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                {group.heading}
              </h3>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {group.types.map((mt) => (
                <button
                  key={mt.value}
                  type="button"
                  onClick={() => setMathType(mt.value)}
                  className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition-all ${
                    mathType === mt.value
                      ? 'bg-gradient-to-r from-rose-400 to-rose-500 text-white shadow-md'
                      : 'bg-white text-zinc-700 shadow-sm hover:shadow-md active:scale-95 dark:bg-zinc-800 dark:text-zinc-300'
                  }`}
                  style={{ minHeight: 'var(--min-tap-target)' }}
                >
                  <span className="text-lg">{mt.emoji}</span>
                  <span>{mt.label}</span>
                </button>
                ))}
              </div>
            </div>
          ))}
        </>
        )}
      </section>
      )}

      {/* Controls — opt-in per game via showControls. Lets kids pick
          between tap-to-flap and drag-to-steer. */}
      {showControls ? (
        <section className="mt-6 w-full max-w-lg">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Controls
          </h2>
          <p className="mt-1 text-xs text-zinc-400">
            How you want to play.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {CONTROLS_OPTIONS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setControls(c.value)}
                className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-3 text-sm font-medium transition-all ${
                  controls === c.value
                    ? 'bg-gradient-to-b from-sky-400 to-sky-500 text-white shadow-md scale-105'
                    : 'bg-white text-zinc-700 shadow-sm hover:shadow-md active:scale-95 dark:bg-zinc-800 dark:text-zinc-300'
                }`}
                style={{ minHeight: 'var(--min-tap-target)' }}
              >
                <span className="text-xl">{c.emoji}</span>
                <span>{c.label}</span>
                <span className={`text-[10px] ${controls === c.value ? 'text-sky-50' : 'text-zinc-400'}`}>
                  {c.blurb}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* View — opt-in per game via showView. Same game, two renderers. */}
      {showView ? (
        <section className="mt-6 w-full max-w-lg">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
            How it looks
          </h2>
          <p className="mt-1 text-xs text-zinc-400">
            Same game either way — pick whichever you like better.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {VIEW_OPTIONS.map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => setView(v.value)}
                aria-pressed={view === v.value}
                className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-3 text-sm font-medium transition-all ${
                  view === v.value
                    ? 'bg-gradient-to-b from-violet-400 to-violet-500 text-white shadow-md scale-105'
                    : 'bg-white text-zinc-700 shadow-sm hover:shadow-md active:scale-95 dark:bg-zinc-800 dark:text-zinc-300'
                }`}
                style={{ minHeight: 'var(--min-tap-target)' }}
              >
                <span className="text-xl">{v.emoji}</span>
                <span>{v.label}</span>
                <span className={`text-[10px] ${view === v.value ? 'text-violet-50' : 'text-zinc-400'}`}>
                  {v.blurb}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* Difficulty — opt-in per game via showDifficulty. */}
      {showDifficulty ? (
        <section className="mt-6 w-full max-w-lg">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Difficulty
          </h2>
          <p className="mt-1 text-xs text-zinc-400">
            Adjusts how fast and challenging the game feels.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setDifficulty(d.value)}
                className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-3 text-sm font-medium transition-all ${
                  difficulty === d.value
                    ? 'bg-gradient-to-b from-amber-400 to-amber-500 text-white shadow-md scale-105'
                    : 'bg-white text-zinc-700 shadow-sm hover:shadow-md active:scale-95 dark:bg-zinc-800 dark:text-zinc-300'
                }`}
                style={{ minHeight: 'var(--min-tap-target)' }}
              >
                <span className="text-xl">{d.emoji}</span>
                <span>{d.label}</span>
                <span className={`text-[10px] ${difficulty === d.value ? 'text-amber-50' : 'text-zinc-400'}`}>
                  {d.blurb}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* Duration — on by default; the pick scales the cookie reward
          (1 min = 1 cookie, 2 = 2, 3 = 3) and sizes the game clock. */}
      {showDuration ? (
        <section className="mt-6 w-full max-w-lg">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
            How long?
          </h2>
          <p className="mt-1 text-xs text-zinc-400">
            Longer games earn more <SugarTokenIcon size="1em" className="inline-block align-text-bottom" /> Sugar Tokens.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {DURATION_CHOICES.map((d) => {
              const meta = DURATION_LABELS[d];
              const selected = duration === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-3 text-sm font-medium transition-all ${
                    selected
                      ? 'bg-gradient-to-b from-emerald-400 to-emerald-600 text-white shadow-md scale-105'
                      : 'bg-white text-zinc-700 shadow-sm hover:shadow-md active:scale-95 dark:bg-zinc-800 dark:text-zinc-300'
                  }`}
                  style={{ minHeight: 'var(--min-tap-target)' }}
                >
                  <span className="text-xl">{meta.emoji}</span>
                  <span>{meta.label}</span>
                  <span className={`flex items-center gap-0.5 text-[10px] ${selected ? 'text-emerald-50' : 'text-zinc-400'}`}>
                    <SugarTokenIcon size="1em" />×{d}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Play button */}
      <div className="mt-8 w-full max-w-lg">
        <button
          type="button"
          onClick={() => {
            // iPad fullscreen has to be requested inside the user-gesture
            // frame this click provides — async timers can't trigger it.
            // Universal across every game now (lifted from the
            // game-specific Water Balloons shell).
            try {
              const root = document.documentElement as HTMLElement & {
                webkitRequestFullscreen?: () => Promise<void>;
              };
              if (!document.fullscreenElement) {
                if (root.requestFullscreen) {
                  root.requestFullscreen().catch(() => { /* user denied or unsupported */ });
                } else if (root.webkitRequestFullscreen) {
                  root.webkitRequestFullscreen();
                }
              }
            } catch {
              // Fullscreen is a nice-to-have — game still works without it.
            }
            // Record the chosen length in the session singleton the game
            // hosts + attempts POST read (see lib/games/session-duration).
            if (showDuration) setSessionDuration(duration);
            // Same hand-off as the duration above: set once here, read by the
            // generator inside the game. Always called, so clearing a list on
            // the parent tab takes effect on the very next round.
            setClassLists(kidClassLists);
            // In Words mode the word kind lives in `readingType`; math mode
            // carries `mathType`. The shell keys off `mode` + `readingType`.
            const base: LaunchSettings =
              mode === 'verbal'
                ? { level: selectedLevel, mode, readingType }
                : subject === 'reading'
                  ? { level: selectedLevel, mode, readingType }
                  : { level: selectedLevel, mode, mathType };
            const withDifficulty = showDifficulty ? { ...base, difficulty } : base;
            const withControls = showControls ? { ...withDifficulty, controls } : withDifficulty;
            const withView = showView ? { ...withControls, view } : withControls;
            onStart(showDuration ? { ...withView, duration } : withView);
          }}
          className="w-full rounded-full py-5 text-xl font-bold text-white shadow-xl transition-all hover:shadow-2xl active:scale-[0.97]"
          style={{
            background: 'linear-gradient(135deg, var(--brand-strawberry, #fb7185), var(--brand-cherry, #dc2626))',
            minHeight: 'var(--min-tap-target)',
          }}
        >
          Let&rsquo;s go! 🎮
        </button>
      </div>

      {/* Brand sign-off — a quiet Gamecakes lockup so every game's launcher
          closes on the brand. */}
      <div className="mt-6 flex items-center justify-center opacity-60">
        <GamecakesLogo size={20} showWordmark />
      </div>
    </main>
  );
}
