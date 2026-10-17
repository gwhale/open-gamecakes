// The story validator at the bottom of story-events.ts only console.warn()s in
// dev, so a typo'd region slug would ship. This makes the same checks a gate,
// and holds the copy to the style guide the file's header sets out.

import { describe, expect, it } from 'vitest';
import { STORY_EVENTS, findStory, isStorySlug } from './story-events';
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
});
