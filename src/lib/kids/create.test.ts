import { describe, expect, it } from 'vitest';
import {
  normalizeHandle,
  validateHandle,
  parseGrade,
  handleTaken,
  HANDLE_MESSAGES,
  HANDLE_MAX,
} from './create';

describe('validateHandle', () => {
  it('accepts the handles a kid would actually pick', () => {
    for (const h of ['Zoomer', 'sam', 'Player_2', 'rocket-kid', 'A1', 'x9']) {
      expect(validateHandle(h), h).toBeNull();
    }
  });

  // The rule that carries the no-PII promise. It cannot stop someone typing a
  // first name, but it structurally rules out a FULL name, which is the part
  // that would actually identify a child.
  it('rejects anything with a space', () => {
    for (const h of ['Anna Smith', 'two words', 'a b']) {
      expect(validateHandle(h), h).toBe('has_space');
    }
  });

  it('rejects lengths outside the band', () => {
    expect(validateHandle('a')).toBe('too_short');
    expect(validateHandle('x'.repeat(HANDLE_MAX + 1))).toBe('too_long');
    expect(validateHandle('x'.repeat(HANDLE_MAX))).toBeNull();
  });

  it('rejects an empty or whitespace-only handle', () => {
    expect(validateHandle('')).toBe('empty');
    expect(validateHandle('   ')).toBe('empty');
  });

  it('rejects characters that would break a URL or read as markup', () => {
    for (const h of ['<script>', 'a/b', 'sam@home', 'emoji🧁', '-leading']) {
      expect(validateHandle(h), h).not.toBeNull();
    }
  });

  it('rejects names the app already means', () => {
    for (const h of ['guest', 'Guest', 'GUEST', 'admin', 'cakey']) {
      expect(validateHandle(h), h).toBe('reserved');
    }
  });

  it('has a message for every failure, and none of them is a shrug', () => {
    for (const [code, message] of Object.entries(HANDLE_MESSAGES)) {
      expect(message.length, code).toBeGreaterThan(10);
      // Kid-facing copy: tell them what to do, do not scold.
      expect(message.toLowerCase(), code).not.toContain('invalid');
      expect(message.toLowerCase(), code).not.toContain('error');
    }
  });
});

describe('normalizeHandle', () => {
  it('trims and collapses, but keeps case', () => {
    expect(normalizeHandle('  Zoomer  ')).toBe('Zoomer');
    expect(normalizeHandle('two   words')).toBe('two words');
    // A kid who types Zoomer should see Zoomer.
    expect(normalizeHandle('ZoOmEr')).toBe('ZoOmEr');
  });
});

describe('parseGrade', () => {
  it('maps K to 0 and the rest to their number', () => {
    expect(parseGrade('K')).toBe(0);
    expect(parseGrade('k')).toBe(0);
    expect(parseGrade('1')).toBe(1);
    expect(parseGrade('6')).toBe(6);
  });

  // null is a VALID stored value — no grade means middle-of-range defaults —
  // so this must never throw and never block an insert.
  it('returns null for anything it does not recognise, rather than throwing', () => {
    for (const bad of ['', '  ', '12', 'Y', 'first', null, undefined, 7, {}]) {
      expect(() => parseGrade(bad)).not.toThrow();
      expect(parseGrade(bad), String(bad)).toBeNull();
    }
  });
});

describe('handleTaken', () => {
  it('is case-insensitive within the family', () => {
    const existing = ['Sam', 'Zoomer'];
    expect(handleTaken('sam', existing)).toBe(true);
    expect(handleTaken('SAM', existing)).toBe(true);
    expect(handleTaken('  Sam ', existing)).toBe(true);
    expect(handleTaken('Alex', existing)).toBe(false);
  });

  it('is false against an empty family', () => {
    expect(handleTaken('Sam', [])).toBe(false);
  });
});
