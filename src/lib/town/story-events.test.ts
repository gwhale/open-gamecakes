// The story validator at the bottom of story-events.ts only console.warn()s in
// dev, so a typo'd region slug would ship. This makes the same checks a gate,
// and holds the copy to the style guide the file's header sets out.

import { describe, expect, it } from 'vitest';
import { STORY_EVENTS, findStory, isStoryEligible, isStorySlug } from './story-events';
import { findRegion } from './regions';

describe('story events', () => {
  it('have unique slugs', () => {
    const slugs = STORY_EVENTS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('point only at regions that exist', () => {
    for (const s of STORY_EVENTS) {
      if (s.regionSlug) expect(findRegion(s.regionSlug), `${s.slug} → ${s.regionSlug}`).toBeDefined();
      if (s.trigger.kind === 'region-discovered') {
        expect(findRegion(s.trigger.regionSlug), `${s.slug} trigger`).toBeDefined();
      }
    }
  });

  it('carry 3–5 beats, each short enough to read aloud', () => {
    for (const s of STORY_EVENTS) {
      expect(s.beats.length, s.slug).toBeGreaterThanOrEqual(3);
      expect(s.beats.length, s.slug).toBeLessThanOrEqual(5);
      for (const b of s.beats) expect(b.length, `${s.slug}: "${b}"`).toBeLessThanOrEqual(90);
    }
  });

  it('findStory / isStorySlug agree', () => {
    for (const s of STORY_EVENTS) {
      expect(findStory(s.slug)).toBe(s);
      expect(isStorySlug(s.slug)).toBe(true);
    }
    expect(findStory('nope')).toBeUndefined();
    expect(isStorySlug('nope')).toBe(false);
  });

  it('announces Puzzle Island as a new-land arrival', () => {
    const s = findStory('puzzle-island-opens')!;
    expect(s).toBeDefined();
    expect(s.style).toBe('arrival');
    expect(s.regionSlug).toBe('puzzle-isle');
  });

  it('skips old world news for kids who joined after it, and welcomes only them', () => {
    const none = new Set<string>();
    const puzzle = findStory('puzzle-island-opens')!;
    const welcome = findStory('welcome-to-the-island')!;
    const veteran = { joinedOn: '2026-08-01', discovered: none };
    const newKid = { joinedOn: '2026-11-01', discovered: none };
    expect(isStoryEligible(puzzle, veteran)).toBe(true);
    expect(isStoryEligible(puzzle, newKid)).toBe(false);
    expect(isStoryEligible(welcome, veteran)).toBe(false);
    expect(isStoryEligible(welcome, newKid)).toBe(true);
    // A brand-new kid's first toast is the welcome, not a backlog story.
    expect(STORY_EVENTS.find((s) => isStoryEligible(s, newKid))?.slug).toBe('welcome-to-the-island');
  });

  it('keeps region stories for whoever reaches the region', () => {
    const sub = findStory('sunken-batterlands-opens')!;
    expect(isStoryEligible(sub, { joinedOn: '2026-11-01', discovered: new Set() })).toBe(false);
    expect(isStoryEligible(sub, { joinedOn: '2026-11-01', discovered: new Set(['caramel-cove']) })).toBe(true);
  });
});
