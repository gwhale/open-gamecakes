// "So what" — turning the portal's faithful readouts into things worth doing.
//
// Every parent view so far reports numbers accurately and interprets nothing. A
// parent reads "51 rounds, tier 1 sight words" and has to do the analysis
// themselves. These functions do that analysis, in ranked order, and each
// insight carries a concrete next step where one exists.
//
// RULES THIS FILE FOLLOWS
//  * Concerns before celebrations. A parent skimming on a phone should meet the
//    actionable thing first.
//  * Never claim more than the data supports — no "accuracy", and a suggestion
//    is only made when there is genuinely a game that would help.
//  * Say WHY, and say WHAT TO DO. "Below grade level" is a fact; naming the
//    game AND the word kind that practises exactly that skill is the reason
//    and the action, which is what a parent can actually use.
//
// ⚠️ THIS FILE USED TO SAY "there is only 1 reading game to choose from",
// which was wrong. Every maths game has a Words mode, so 16 of them teach
// reading; what was actually missing was content for most reading standards
// (fixed 2026-07-26) — never re-derive a library-scarcity story from
// `g.subject` counts alone.

import { getLiveGames, type GameInfo } from '@/lib/games/registry';
import {
  READING_KINDS,
  type ReadingChallengeType,
} from '@/lib/games/shared/generate-reading-challenge';
import { verbalSkillFor } from '@/lib/games/shared/challenge-mode';
import { SIGHT_WORDS_SKILLS } from '@/lib/games/sight-words-skill';
import { gradeLevel } from './grade-level';

/** skill slug → the word kind that drills it, e.g.
 *  'letter-sounds' → { label: 'Letter Sounds' }.
 *
 *  DERIVED by inverting verbalSkillFor rather than hand-written, so adding a
 *  reading type can never leave the portal recommending a kind that no longer
 *  maps to that skill. Both tiers are probed because 'comprehension' resolves
 *  to two different skill rows depending on tier. */
const KIND_FOR_SKILL: Map<string, ReadingChallengeType> = (() => {
  const m = new Map<string, ReadingChallengeType>();
  for (const kind of Object.keys(READING_KINDS) as ReadingChallengeType[]) {
    if (kind === 'mixed') continue;
    for (const tier of [1, 5]) {
      const { slug } = verbalSkillFor(kind, null, tier);
      if (!m.has(slug)) m.set(slug, kind);
    }
  }
  // The 'sight-words' kind resolves to a different row per kid, so probing
  // above reaches only one of the three. Map the whole family explicitly —
  // without this, a kindergarten kid behind on sight words (the single most
  // likely reading concern this portal will ever show) got no word kind named.
  for (const slug of SIGHT_WORDS_SKILLS) m.set(slug, 'sight-words');
  return m;
})();

export type InsightTone = 'concern' | 'note' | 'win';

export interface Insight {
  tone: InsightTone;
  /** Short headline. */
  title: string;
  /** One or two sentences of plain language. */
  detail: string;
  /** Optional concrete next step. */
  action?: { label: string; href: string };
}

export interface InsightSkill {
  /** Display name ("Kindergarten sight words") — this is what a parent reads.
   *  NOT skills.name, which is the slug. */
  name: string;
  /** skills.name, the slug. Used to find the word kind that drills this
   *  skill; prose must never be built from it. */
  slug: string;
  subject: string;
  currentTier: number;
  onTrackTier: number | null;
  masteryPct: number | null;
}

export interface InsightInput {
  kidName: string;
  skills: InsightSkill[];
  /** Rounds played per game slug over the window being summarised. */
  roundsByGame: Record<string, number>;
  /** Rounds with no game recorded (pre-tracking). */
  untrackedRounds: number;
}

/** Live games that can practise a subject.
 *
 *  Reading deliberately includes every `wordsMode` game, not just games whose
 *  LAND is reading — a maths game switched to Words mode is a reading game for
 *  that session. Mirrors how /games builds its Word Games section; counting
 *  `subject` alone is what produced the old "only 1 reading game" claim. */
function gamesFor(subject: string): GameInfo[] {
  return getLiveGames().filter((g) =>
    subject === 'reading' ? g.subject === 'reading' || g.wordsMode : g.subject === subject,
  );
}

const SUBJECT_WORD: Record<string, string> = {
  math: 'maths',
  reading: 'reading',
  logic: 'logic',
};

export function buildInsights(input: InsightInput): Insight[] {
  const out: Insight[] = [];
  const { kidName, skills, roundsByGame } = input;

  const graded = skills.filter((s) => s.onTrackTier != null);
  const behind = graded
    .map((s) => ({ s, g: gradeLevel(s.currentTier, s.onTrackTier) }))
    .filter((x) => x.g.standing === 'behind')
    .sort((a, b) => a.g.delta - b.g.delta);
  const ahead = graded
    .map((s) => ({ s, g: gradeLevel(s.currentTier, s.onTrackTier) }))
    .filter((x) => x.g.standing === 'ahead')
    .sort((a, b) => b.g.delta - a.g.delta);

  // 1. The weakest skill, with a way to practise exactly that skill.
  for (const { s, g } of behind.slice(0, 2)) {
    const options = gamesFor(s.subject);
    // `mastery_pct` is mastery OF THE CURRENT LEVEL, not of the skill overall.
    // Printing a bare "100% mastery" next to "4 tiers below grade level" read
    // as a contradiction; said properly it is the most actionable line here —
    // they have finished the level they are on and nobody moved them up.
    const mastery =
      s.masteryPct == null
        ? ''
        : s.masteryPct >= 0.9
          ? ` They have level ${s.currentTier} fully mastered, so the level is worth nudging up.`
          : ` They are ${Math.round(s.masteryPct * 100)}% through level ${s.currentTier}.`;
    const kind = KIND_FOR_SKILL.get(s.slug);
    // Recommend the game this kid ALREADY plays most, not whichever happens to
    // sit first in the registry. Now that ~17 games can practise reading, the
    // choice is arbitrary on the merits — so pick the one they will actually
    // open. Falls back to the first option for a kid with no history.
    const pick =
      [...options].sort((a, b) => (roundsByGame[b.slug] ?? 0) - (roundsByGame[a.slug] ?? 0))[0] ??
      options[0];

    // Naming the word kind is the whole point. A reading skill is practised by
    // switching any game to Words and choosing one kind — telling a parent to
    // "play a reading game" when 17 games qualify is not an instruction.
    const detail =
      kind && pick
        ? `${kidName} is ${g.label.toLowerCase()} on ${s.name.toLowerCase()}.${mastery} Any game can drill this: open it, tap Words, and pick ${READING_KINDS[kind].label}.`
        : `${kidName} is ${g.label.toLowerCase()} on ${s.name.toLowerCase()}.${mastery}`;

    out.push({
      tone: 'concern',
      title: `${s.name} needs attention`,
      detail,
      action: pick
        ? {
            label: kind ? `Play ${pick.label} → ${READING_KINDS[kind].label}` : `Play ${pick.label}`,
            href: `/games/${pick.slug}`,
          }
        : undefined,
    });
  }

  // 2. A subject with genuinely nothing to play. Counts PRACTISABLE games, so
  //    reading counts its Words-mode games — the old version compared raw
  //    `subject` tallies and reported a reading shortage that did not exist.
  const practisable = new Map<string, number>();
  for (const subj of Object.keys(SUBJECT_WORD)) practisable.set(subj, gamesFor(subj).length);
  const starved = [...practisable.entries()].filter(([, n]) => n === 0);
  if (starved.length > 0 && getLiveGames().length > 4) {
    out.push({
      tone: 'note',
      title: 'Nothing to play for one subject',
      detail: `There is no way to practise ${starved
        .map(([s]) => SUBJECT_WORD[s] ?? s)
        .join(' or ')} yet, so time on task cannot go there whatever anyone intends.`,
    });
  }

  // 3. A game they are bouncing off — lots of rounds, still behind.
  const topGame = Object.entries(roundsByGame).sort((a, b) => b[1] - a[1])[0];
  if (topGame && topGame[1] >= 10) {
    const info = getLiveGames().find((g) => g.slug === topGame[0]);
    const stuck = behind.find((b) => b.s.subject === info?.subject);
    if (info && stuck) {
      out.push({
        tone: 'note',
        title: `Lots of ${info.label}, not much movement`,
        detail: `${topGame[1]} rounds of ${info.label} and ${stuck.s.name.toLowerCase()} is still ${stuck.g.label.toLowerCase()}. Worth watching whether the level is set right.`,
      });
    }
  }

  // 4. Close with something good, so the picture is not only problems.
  if (ahead.length > 0) {
    const best = ahead[0];
    out.push({
      tone: 'win',
      title: `Well ahead on ${best.s.name.toLowerCase()}`,
      detail: `${kidName} is working ${best.g.delta} tier${best.g.delta === 1 ? '' : 's'} above grade level${
        ahead.length > 1 ? `, and is ahead on ${ahead.length - 1} other skill${ahead.length - 1 === 1 ? '' : 's'} too` : ''
      }.`,
    });
  }

  if (out.length === 0) {
    out.push({
      tone: 'note',
      title: 'Not enough to go on yet',
      detail: `${kidName} needs a bit more play before there is anything worth reading into.`,
    });
  }
  return out;
}
