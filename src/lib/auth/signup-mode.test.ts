// The interlock is the only reason this file is not a one-line boolean, so it
// is what these tests are mostly about.
//
// The failure it prevents is silent and expensive: SIGNUP_MODE=open set
// without SIGNUP_DEFAULT_TIER=restricted means every stranger who signs up
// lands on the full tier, which grants 'ai', which is the deployment owner's
// model balance. Nothing about that looks wrong from the outside — signup
// works, families appear, the bill arrives later.
//
// So the assertion that matters is a negative one: configured that way,
// signupMode() must NOT say 'open'.

import { afterEach, describe, expect, it } from 'vitest';
import { openSignupsPerDay, signupMode, signupModeIsHeldBack } from './signup-mode';

const MODE = process.env.SIGNUP_MODE;
const TIER = process.env.SIGNUP_DEFAULT_TIER;
const MAX = process.env.SIGNUP_OPEN_MAX_PER_DAY;

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore('SIGNUP_MODE', MODE);
  restore('SIGNUP_DEFAULT_TIER', TIER);
  restore('SIGNUP_OPEN_MAX_PER_DAY', MAX);
});

describe('signupMode', () => {
  it('requires an invite by default', () => {
    delete process.env.SIGNUP_MODE;
    delete process.env.SIGNUP_DEFAULT_TIER;
    expect(signupMode()).toBe('invite');
  });

  it('opens when the tier default is restricted', () => {
    process.env.SIGNUP_MODE = 'open';
    process.env.SIGNUP_DEFAULT_TIER = 'restricted';
    expect(signupMode()).toBe('open');
  });

  // THE ONE THAT MATTERS. Half-configured must mean shut, not open-and-costly.
  it('refuses to open while new families would land on the full tier', () => {
    process.env.SIGNUP_MODE = 'open';
    delete process.env.SIGNUP_DEFAULT_TIER; // defaults to 'full'
    expect(signupMode()).toBe('invite');

    process.env.SIGNUP_DEFAULT_TIER = 'full';
    expect(signupMode()).toBe('invite');

    // A typo falls back to 'full' in signupTier(), so it must be held back too
    // — otherwise a misspelling of the safe value produces the unsafe state.
    process.env.SIGNUP_DEFAULT_TIER = 'restrictd';
    expect(signupMode()).toBe('invite');
  });

  it('opens only on the exact string open', () => {
    process.env.SIGNUP_DEFAULT_TIER = 'restricted';
    for (const v of ['true', 'OPEN', 'Open', '1', 'yes', '']) {
      process.env.SIGNUP_MODE = v;
      expect(signupMode(), `SIGNUP_MODE=${JSON.stringify(v)}`).toBe('invite');
    }
  });

  // Order-independence is the point of reading the env on every call rather
  // than caching at import. Whichever variable is set second, the result is
  // the same, and no deploy is needed between them.
  it('does not depend on which variable was set first', () => {
    process.env.SIGNUP_DEFAULT_TIER = 'restricted';
    process.env.SIGNUP_MODE = 'open';
    expect(signupMode()).toBe('open');

    delete process.env.SIGNUP_MODE;
    delete process.env.SIGNUP_DEFAULT_TIER;
    process.env.SIGNUP_MODE = 'open';
    process.env.SIGNUP_DEFAULT_TIER = 'restricted';
    expect(signupMode()).toBe('open');
  });
});

describe('signupModeIsHeldBack', () => {
  it('is true exactly when open was asked for and withheld', () => {
    process.env.SIGNUP_MODE = 'open';
    delete process.env.SIGNUP_DEFAULT_TIER;
    expect(signupModeIsHeldBack()).toBe(true);
  });

  it('is false when open was granted', () => {
    process.env.SIGNUP_MODE = 'open';
    process.env.SIGNUP_DEFAULT_TIER = 'restricted';
    expect(signupModeIsHeldBack()).toBe(false);
  });

  // Nobody asked for open, so there is nothing being held back and no warning
  // to show. A banner here would appear on every default deployment.
  it('is false when open was never asked for', () => {
    delete process.env.SIGNUP_MODE;
    delete process.env.SIGNUP_DEFAULT_TIER;
    expect(signupModeIsHeldBack()).toBe(false);
    process.env.SIGNUP_DEFAULT_TIER = 'restricted';
    expect(signupModeIsHeldBack()).toBe(false);
  });
});

describe('openSignupsPerDay', () => {
  it('defaults to 5', () => {
    delete process.env.SIGNUP_OPEN_MAX_PER_DAY;
    expect(openSignupsPerDay()).toBe(5);
  });

  it('takes a configured positive integer', () => {
    process.env.SIGNUP_OPEN_MAX_PER_DAY = '25';
    expect(openSignupsPerDay()).toBe(25);
  });

  // Garbage falls back to the default rather than to zero or Infinity. Zero
  // would shut signup with no explanation; Infinity would remove the limit
  // while still looking configured.
  it('falls back to the default on unusable values', () => {
    for (const v of ['', 'lots', '0', '-3', 'NaN', 'Infinity']) {
      process.env.SIGNUP_OPEN_MAX_PER_DAY = v;
      expect(openSignupsPerDay(), `value=${JSON.stringify(v)}`).toBe(5);
    }
  });

  it('floors a fractional value rather than passing it to SQL', () => {
    process.env.SIGNUP_OPEN_MAX_PER_DAY = '7.9';
    expect(openSignupsPerDay()).toBe(7);
  });
});
