import { describe, expect, it } from 'vitest';
import { mainEmailOf } from './overview';

describe('mainEmailOf', () => {
  it('prefers the signup contact email', () => {
    expect(mainEmailOf('a@x.org', ['b@x.org'], 'c@x.org')).toEqual({ mainEmail: 'a@x.org', mainEmailSource: 'contact' });
  });

  it('falls back to the first digest address, then a real account email', () => {
    expect(mainEmailOf(null, ['', ' b@x.org '], 'c@x.org')).toEqual({ mainEmail: 'b@x.org', mainEmailSource: 'digest' });
    expect(mainEmailOf('  ', [], 'c@x.org')).toEqual({ mainEmail: 'c@x.org', mainEmailSource: 'account' });
  });

  it('is empty when there is nothing to reach', () => {
    expect(mainEmailOf(null, null, null)).toEqual({ mainEmail: null, mainEmailSource: null });
  });
});
