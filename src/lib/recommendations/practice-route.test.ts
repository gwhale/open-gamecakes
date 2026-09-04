// The routing invariant.
//
// A recommendation with no route renders as a skill name the kid cannot tap,
// which is how six of the thirteen newly-credited math skills sat unreachable
// for a week. Rather than keeping a hand-checked list, assert the property
// directly: every skill the engine can CREDIT must be a skill the engine can
// ROUTE to. Both sides are derived from the same functions the app uses, so a
// new operation or word kind fails here the moment it has no game.

import { describe, expect, it } from 'vitest';
import { practiceHref } from './next-play';
import { UPSTREAM_GAMES } from '@/lib/games/registry';
import { mathSkillFor, verbalSkillFor, type MathKind } from '@/lib/games/shared/challenge-mode';
import { READING_KINDS, type ReadingChallengeType } from '@/lib/games/shared/generate-reading-challenge';
import { GAME_REGISTRY } from '@/lib/games/registry';

const TIERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const MATH_KINDS: MathKind[] = [
  'addition',
  'subtraction',
  'multiplication',
  'division',
  'mixed',
  'compare',
  'place-value',
  'skip-count',
  'shapes',
  'time-money',
  'fractions',
  'area',
];

const READING_TYPES = Object.keys(READING_KINDS) as ReadingChallengeType[];

/** kids.grade values the sight-words band splits on, plus "unknown". */
const GRADES = [null, 0, 1, 2, 3, 4, 5];

describe('practice routing', () => {
  it('routes every math skill the games can credit', () => {
    const unrouted = new Set<string>();
    for (const kind of MATH_KINDS) {
      for (const tier of TIERS) {
        const { slug } = mathSkillFor(kind, tier);
        if (!practiceHref(slug, tier)) unrouted.add(`${slug} (${kind} @ ${tier})`);
      }
    }
    expect([...unrouted]).toEqual([]);
  });

  it('routes every reading skill the games can credit', () => {
    const unrouted = new Set<string>();
    for (const type of READING_TYPES) {
      for (const grade of GRADES) {
        for (const tier of TIERS) {
          const { slug } = verbalSkillFor(type, grade, tier);
          if (!practiceHref(slug, tier)) unrouted.add(`${slug} (${type})`);
        }
      }
    }
    expect([...unrouted]).toEqual([]);
  });

  it('carries the operation and the level, not just the game', () => {
    const href = practiceHref('divide-within-100', 7);
    expect(href).toBe('/games/math-asteroids?op=division&level=7');
  });

  it('clamps an out-of-range tier rather than emitting an unselectable level', () => {
    expect(practiceHref('add-within-10', 99)).toContain('level=10');
    expect(practiceHref('add-within-10', -4)).toContain('level=1');
  });

  it('returns null for a skill with no game, instead of a broken link', () => {
    // long-division has a game; percents (grade 6) does not yet.
    expect(practiceHref('percents', 10)).toBeNull();
    expect(practiceHref('not-a-real-skill', 3)).toBeNull();
  });

  // This used to name one keypad-only game. That game is a family's own now
  // (registry.local.ts), so the assertion was about to become vacuous — and
  // the risk it guarded had grown into a bigger one: a recommendation pointing
  // at a game the public repo does not ship is a dead link for everyone who
  // is not this household.
  //
  // So assert the stronger property instead: every game this map names is one
  // UPSTREAM ships. Local games are welcome in a fork's own copy; they cannot
  // be the target of an upstream recommendation.
  it('only ever routes to games upstream actually ships', () => {
    const upstream = new Set(UPSTREAM_GAMES.map((g) => g.slug));
    const routed = new Set<string>();
    for (const kind of MATH_KINDS) {
      for (const tier of TIERS) {
        const href = practiceHref(mathSkillFor(kind, tier).slug, tier);
        if (href) routed.add(href.split('?')[0].replace('/games/', ''));
      }
    }
    for (const type of READING_TYPES) {
      for (const grade of GRADES) {
        const href = practiceHref(verbalSkillFor(type, grade, 3).slug, 3);
        if (href) routed.add(href.split('?')[0].replace('/games/', ''));
      }
    }
    expect(routed.size).toBeGreaterThan(5);
    for (const slug of routed) {
      expect(upstream.has(slug), `${slug} is routed to but not in UPSTREAM_GAMES`).toBe(true);
    }
  });
  // A retired game is off the town map and out of the menus. It stays routable
  // by slug so back-nav and deep links resolve, which is exactly what made it
  // look like a usable destination — every reading skill pointed at word-flap
  // and division at water-balloons, both retired, so "practise this" walked a
  // kid into the Graveyard. Derived from the registry rather than a hand-kept
  // list, so retiring a game tomorrow fails here instead of in a kid's hands.
  it('never routes a skill to a retired game', () => {
    const retired = new Set(
      GAME_REGISTRY.filter((g) => g.retired).map((g) => `/games/${g.slug}`),
    );
    // No assertion that the set is non-empty. It was, when word-flap and
    // water-balloons still existed; both have since been deleted rather than
    // left in the Graveyard, so zero retired games is now the correct state and
    // this check is prospective — it fires the next time something is retired.
    const bad: string[] = [];
    for (const type of READING_TYPES) {
      for (const grade of GRADES) {
        for (const tier of TIERS) {
          const { slug } = verbalSkillFor(type, grade, tier);
          const href = practiceHref(slug, tier);
          if (href && retired.has(href.split('?')[0])) bad.push(`${slug} -> ${href}`);
        }
      }
    }
    for (const kind of MATH_KINDS) {
      for (const tier of TIERS) {
        const { slug } = mathSkillFor(kind, tier);
        const href = practiceHref(slug, tier);
        if (href && retired.has(href.split('?')[0])) bad.push(`${slug} -> ${href}`);
      }
    }
    expect([...new Set(bad)]).toEqual([]);
  });
});
