// Every file under public/voice/cakey is named for the output of this
// function, so changing it orphans the whole rendered corpus at once — and the
// failure is silent, because a miss falls back to the browser voice rather
// than erroring. These pinned values are the tripwire: if they change, the
// audio is already broken and the corpus needs re-rendering.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { hashLine } from './hash-line';
import MANIFEST from './cakey-voice-manifest.json';

describe('hashLine', () => {
  it('produces the values the rendered corpus was named for', () => {
    // Recorded 2026-09-04 from the implementation that named the 103 clips
    // currently on disk. Do not "fix" these to match a new implementation —
    // re-render the corpus instead.
    expect(hashLine('because')).toBe('1r1bja3');
    expect(hashLine('friend')).toBe('1khz72l');
    expect(hashLine('cat')).toBe('1sh0cn');
  });

  it('trims nothing and is case-sensitive — callers normalise, not this', () => {
    expect(hashLine('cat')).not.toBe(hashLine('Cat'));
    expect(hashLine('cat')).not.toBe(hashLine(' cat'));
  });

  it('is stable across calls', () => {
    expect(hashLine('a whole sentence, with punctuation!')).toBe(
      hashLine('a whole sentence, with punctuation!'),
    );
  });

  // The end-to-end check, and the reason the implementation moved into one
  // shared file. Each manifest entry is keyed by the hash the RENDERER
  // computed, and stores the words it split that line into. Re-joining those
  // words and hashing them here has to land on the same key — 103 lines
  // written by the renderer, verified against the runtime's hash.
  //
  // This is what would have caught a silent divergence: it fails on the whole
  // corpus at once, loudly, instead of one muted line at a time in a browser.
  it('agrees with every hash the renderer already wrote', () => {
    const manifest = MANIFEST as { clips: string[]; timings: Record<string, { w: string[] }> };
    const entries = Object.entries(manifest.timings);
    expect(entries.length).toBeGreaterThan(50);

    for (const [hash, timing] of entries) {
      expect(hashLine((timing.w ?? []).join(' ')), `renderer wrote ${hash}`).toBe(hash);
    }
  });

  it('every clip named in the manifest exists on disk', () => {
    const manifest = MANIFEST as { clips: string[] };
    for (const hash of manifest.clips) {
      expect(
        (() => {
          try {
            return readFileSync(`public/voice/cakey/${hash}.mp3`).length > 0;
          } catch {
            return false;
          }
        })(),
        `${hash}.mp3 is in the manifest but not on disk`,
      ).toBe(true);
    }
  });
});
