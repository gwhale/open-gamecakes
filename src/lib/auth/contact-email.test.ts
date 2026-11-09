import { describe, expect, it } from 'vitest';
import { normalizeContactEmail } from './contact-email';

describe('normalizeContactEmail', () => {
  it('trims and lowercases a real address', () => {
    expect(normalizeContactEmail('  Sam@Example.COM ')).toBe('sam@example.com');
  });

  it('refuses anything that is not an address', () => {
    for (const bad of ['', 'sam', 'sam@', '@example.com', 'sam@example', 'a b@example.com', 42, null]) {
      expect(normalizeContactEmail(bad), String(bad)).toBeNull();
    }
  });

  it('refuses an address longer than email allows', () => {
    expect(normalizeContactEmail(`${'a'.repeat(250)}@example.com`)).toBeNull();
  });
});
