// Variety-seeking recommendation engine.
//
// Given a kid's kid_skills state and recent attempts, return a ranked list
// of skills to practice next. Primary bias: time-since-last-practice — the
// kid rotates across their skills so no single one gets stale or burnt out.
// Tiebreak: close-to-tier-up (mastery_pct ≥ 0.5 with ≥5 attempts in window)
// surfaces almost-there skills for visible wins.
//
// Pure function — no DB, no side effects. Input rows come in, ranked
// picks come out. Route handler is responsible for loading + passing.

import type { Skill, KidSkill, Attempt } from '@/lib/types';

export interface Recommendation {
  skillId: string;
  skillSlug: string;
  displayName: string;
  subject: 'math' | 'reading';
  currentTier: number;
  masteryPct: number;
  /** Milliseconds since the last attempt for this skill, or null if never. */
  msSinceLastAttempt: number | null;
  /** One-sentence why we picked this. Rendered as a tooltip in the UI. */
  reason: string;
  /** Optional game slug the kid can tap to start practicing. Null if no
   *  template yet exercises this skill. */
  gameSlug: string | null;
}

export interface PickNextOptions {
  /** How many recommendations to return. Default 3. */
  limit?: number;
  /** Clock injection for deterministic tests. Default Date.now(). */
  now?: number;
  /** Skills to exclude (e.g. non-gamifiable for a kid-facing list). */
  onlyGamifiable?: boolean;
  /** Grade filter — keep only skills whose grade_level matches or precedes
   *  the kid's grade. 'K' | '1' | '2' | ... */
  kidGrade?: string;
}

const GRADE_ORDER = ['K', '1', '2', '3', '4', '5', '6'];

/** Map skill slug → a game AND the question kind that actually exercises it.
 *  Hardcoded until the `games` table is populated.
 *
 *  The `op` half is the point. A bare `/games/flappy-math` link dropped the
 *  recommendation on the floor: the launcher opened on its own defaults, so a
 *  "practice division" nudge produced addition at whatever level the kid last
 *  played. The link now carries `?op=…&level=…` and GameLauncher reads both.
 *
 *  Coverage is the other half. Before 2026-09-03 this map held nine math slugs
 *  and no reading ones, while gameplay credited exactly one skill — so most of
 *  it was unreachable anyway. Now that thirteen math skills and the concept
 *  domains all receive attempts, every skill the engine can generate needs a
 *  route, or the recommendation renders with nowhere to tap.
 *
 *  Games are spread deliberately rather than all pointing at Flappy Math —
 *  variety is the whole premise of this ranker. A keypad-only game never carries
 *  a concept op: its gates cannot render choices (see generateMazeForTier).
 *
 *  EVERY TARGET MUST BE A LIVE GAME.
 *
 *  Retired games stay routable by slug so back-nav, deep links and the ticket
 *  picker keep resolving, which made them look like usable destinations. They
 *  are not: a retired game is off the town map and out of the menus, so
 *  "practise this" was walking a kid into the Graveyard to do the thing the
 *  dashboard just told their parent they needed. Every reading skill pointed at
 *  `word-flap`, and division pointed at `water-balloons` — both retired.
 *
 *  A reading op is enough to pick the game: GameLauncher reads ?op= and flips
 *  itself into Words mode when the op names a word kind, so any live game with
 *  `wordsMode` serves any reading skill. That is what makes spreading them
 *  free. practice-route.test.ts fails if a target is retired or missing. */
const SKILL_TO_PRACTICE: Record<string, { game: string; op?: string }> = {
  // --- math: arithmetic (keypad) ---
  'counting-to-20':          { game: '/games/cakey-stacks',    op: 'addition' },
  'add-within-10':           { game: '/games/sharks-minnows',  op: 'addition' },
  'subtract-within-10':      { game: '/games/sharks-minnows',  op: 'subtraction' },
  'add-within-20':           { game: '/games/marble-maze',     op: 'addition' },
  'subtract-within-20':      { game: '/games/flappy-math',     op: 'subtraction' },
  'make-ten':                { game: '/games/flappy-math',     op: 'addition' },
  'add-double-digit':        { game: '/games/castle-jump',     op: 'addition' },
  'subtract-double-digit':   { game: '/games/castle-jump',     op: 'subtraction' },
  'add-subtract-within-100': { game: '/games/ski-free',        op: 'mixed' },
  'multiply-within-25':      { game: '/games/math-asteroids',  op: 'multiplication' },
  'multiply-within-100':     { game: '/games/math-asteroids',  op: 'multiplication' },
  'divide-within-100':       { game: '/games/math-asteroids',  op: 'division' },
  'multi-digit-multiply':    { game: '/games/castle-crumble',  op: 'multiplication' },
  'multi-digit-operations':  { game: '/games/frosting-fighter', op: 'mixed' },
  'long-division':           { game: '/games/castle-crumble',  op: 'division' },

  // --- math: concept domains (choice buttons) ---
  'number-comparison':       { game: '/games/sharks-minnows',  op: 'compare' },
  'place-value':             { game: '/games/cakey-tower',     op: 'place-value' },
  'skip-counting':           { game: '/games/pacman-cakey',    op: 'skip-count' },
  'shapes-2d':               { game: '/games/marble-maze',     op: 'shapes' },
  'shapes-3d':               { game: '/games/marble-maze',     op: 'shapes' },
  'time-and-money':          { game: '/games/pit-stop',        op: 'time-money' },
  'fraction-concepts':       { game: '/games/cakey-stacks',    op: 'fractions' },
  'equivalent-fractions':    { game: '/games/cakey-stacks',    op: 'fractions' },
  'area-and-perimeter':      { game: '/games/cakey-crane',     op: 'area' },

  // --- reading: every slug verbalSkillFor() can credit ---
  'letter-sounds':               { game: '/games/cakey-road',      op: 'letter-sounds' },
  'phonological-awareness':      { game: '/games/pacman-cakey',    op: 'syllables' },
  'rhyming-words':               { game: '/games/flappy-math',     op: 'rhyming' },
  'sight-words-kindergarten':    { game: '/games/word-memory',     op: 'sight-words' },
  'sight-words-first-grade':     { game: '/games/word-memory',     op: 'sight-words' },
  'sight-words-second-grade':    { game: '/games/word-memory',     op: 'sight-words' },
  'multisyllabic-words':         { game: '/games/cakey-tower',     op: 'word-building' },
  'spelling-patterns':           { game: '/games/sandcastle-siege', op: 'spelling' },
  'synonyms':                    { game: '/games/sharks-minnows',  op: 'synonyms' },
  'word-meaning':                { game: '/games/cakey-racer',     op: 'word-meaning' },
  'context-clues':               { game: '/games/marble-maze',     op: 'context-clues' },
  'greek-latin-roots':           { game: '/games/castle-crumble',  op: 'word-roots' },
  'parts-of-speech':             { game: '/games/ski-free',        op: 'parts-of-speech' },
  'capitalization-punctuation':  { game: '/games/pit-stop',        op: 'punctuation' },
  'simple-comprehension':        { game: '/games/cakey-stacks',    op: 'comprehension' },
  'reading-comprehension':       { game: '/games/castle-jump',     op: 'comprehension' },
  'figurative-language':         { game: '/games/frosting-fighter', op: 'figurative' },
};

/** Build the deep link for a recommendation: which game, set to which question
 *  kind, at the tier the kid is actually on. */
export function practiceHref(skillSlug: string, tier: number): string | null {
  const entry = SKILL_TO_PRACTICE[skillSlug];
  if (!entry) return null;
  const params = new URLSearchParams();
  if (entry.op) params.set('op', entry.op);
  params.set('level', String(Math.max(1, Math.min(10, Math.round(tier)))));
  return `${entry.game}?${params.toString()}`;
}

export function pickNext(args: {
  skills: Skill[];
  kidSkills: KidSkill[];
  recentAttempts: Attempt[];
  options?: PickNextOptions;
}): Recommendation[] {
  const { skills, kidSkills, recentAttempts } = args;
  const opts = args.options ?? {};
  const limit = opts.limit ?? 3;
  const now = opts.now ?? Date.now();
  const onlyGamifiable = opts.onlyGamifiable ?? false;
  const kidGrade = opts.kidGrade;

  const ksMap = new Map(kidSkills.map((ks) => [ks.skill_id, ks]));

  // Compute last-attempt timestamps per skill from the recent attempts array.
  const lastBySkill = new Map<string, number>();
  for (const a of recentAttempts) {
    const t = new Date(a.created_at).getTime();
    const prev = lastBySkill.get(a.skill_id) ?? 0;
    if (t > prev) lastBySkill.set(a.skill_id, t);
  }

  // Filter candidates.
  const candidates = skills.filter((s) => {
    if (onlyGamifiable && !s.gamifiable) return false;
    if (kidGrade && s.grade_level) {
      // Skills for grades ABOVE the kid's are excluded from recs — they'll
      // show as enrichment later. Skills at-or-below are fair game.
      const min = s.grade_level.split('-')[0];
      const kidIdx = GRADE_ORDER.indexOf(kidGrade);
      const minIdx = GRADE_ORDER.indexOf(min);
      if (kidIdx !== -1 && minIdx !== -1 && minIdx > kidIdx) return false;
    }
    return true;
  });

  // Score each candidate.
  const scored = candidates.map((s) => {
    const ks = ksMap.get(s.id);
    const currentTier = ks?.current_tier ?? 1;
    const masteryPct = ks?.mastery_pct ?? 0;
    const windowLen = ks?.recent_window.length ?? 0;
    const lastTs = lastBySkill.get(s.id);
    const msSince = lastTs ? now - lastTs : null;

    // Primary score: variety — higher = further back in time = more
    // "due" for practice. Unplayed skills get a large boost so they
    // surface quickly.
    let varietyScore = msSince ?? (7 * 24 * 60 * 60 * 1000); // null → 7 days

    // Hard cap: if played in the last 15 minutes, deprioritize sharply
    // (the kid is actively on it right now, don't recommend again).
    if (msSince !== null && msSince < 15 * 60 * 1000) {
      varietyScore = msSince - 10 * 24 * 60 * 60 * 1000; // very negative
    }

    // Tiebreak: close-to-tier-up. Bonus if mastery is already healthy
    // but the window isn't quite full enough to auto-promote.
    const closeToUp =
      masteryPct >= 0.5 && windowLen >= 5 && windowLen < 10
        ? 1
        : 0;

    // Soft penalty: not-started skills are fine to recommend but less
    // urgent than "almost mastered, needs a push" skills.
    const notStarted = currentTier === 1 && windowLen === 0 ? -0.1 : 0;

    return {
      skill: s,
      ks,
      currentTier,
      masteryPct,
      msSince,
      score: varietyScore + closeToUp * 60 * 60 * 1000 + notStarted * 60 * 60 * 1000,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  // De-duplicate by game so we don't recommend the same game twice.
  const seenGames = new Set<string>();
  const picks: Recommendation[] = [];
  for (const row of scored) {
    if (picks.length >= limit) break;
    const gameSlug = practiceHref(row.skill.name, row.currentTier);
    // De-dupe on the GAME, not the full href — two recommendations that differ
    // only by ?op= are still the same game twice in a row.
    const gameKey = SKILL_TO_PRACTICE[row.skill.name]?.game ?? `skill:${row.skill.id}`;
    if (seenGames.has(gameKey)) continue;
    seenGames.add(gameKey);

    picks.push({
      skillId: row.skill.id,
      skillSlug: row.skill.name,
      displayName: row.skill.display_name,
      subject: row.skill.subject,
      currentTier: row.currentTier,
      masteryPct: row.masteryPct,
      msSinceLastAttempt: row.msSince,
      reason: buildReason(row),
      gameSlug,
    });
  }

  return picks;
}

function buildReason(row: {
  skill: Skill;
  ks: KidSkill | undefined;
  currentTier: number;
  masteryPct: number;
  msSince: number | null;
}): string {
  if (row.msSince === null) {
    return `Haven't tried ${row.skill.display_name} yet`;
  }
  const days = Math.floor(row.msSince / (24 * 60 * 60 * 1000));
  const hours = Math.floor(row.msSince / (60 * 60 * 1000));
  const windowLen = row.ks?.recent_window.length ?? 0;
  const closeToUp = row.masteryPct >= 0.5 && windowLen >= 5 && windowLen < 10;

  if (closeToUp) return `Close to tier ${row.currentTier + 1} — one good round could unlock it`;
  if (days >= 2) return `${days} days since last practice`;
  if (days >= 1) return '1 day since last practice';
  if (hours >= 1) return `${hours}h since last practice`;
  return 'Recently played';
}
