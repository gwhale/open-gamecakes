// The kill switch is the thing you reach for when money is moving and you want
// it to stop NOW. It has to work from a cold read of the environment, with no
// deploy and no cache.

import { afterEach, describe, expect, it } from 'vitest';
import { aiKey, aiUnavailableReason } from './enabled';

const KEY = process.env.OPENROUTER_API_KEY;
const FLAG = process.env.AI_ENABLED;

afterEach(() => {
  if (KEY === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = KEY;
  if (FLAG === undefined) delete process.env.AI_ENABLED;
  else process.env.AI_ENABLED = FLAG;
});

describe('aiKey', () => {
  it('returns the key when configured and not switched off', () => {
    process.env.OPENROUTER_API_KEY = 'sk-test';
    delete process.env.AI_ENABLED;
    expect(aiKey()).toBe('sk-test');
  });

  it('returns null when AI_ENABLED=false, even with a valid key', () => {
    process.env.OPENROUTER_API_KEY = 'sk-test';
    process.env.AI_ENABLED = 'false';
    expect(aiKey()).toBeNull();
  });

  it('returns null when no key is configured', () => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.AI_ENABLED;
    expect(aiKey()).toBeNull();
  });

  // Only the exact string 'false' switches it off. A kill switch that also
  // triggered on 'FALSE', '0' or 'no' would be a kill switch that triggers on
  // a typo — and silently disabling a paid feature because someone wrote '0'
  // is its own kind of outage.
  it('is switched off only by the exact string false', () => {
    process.env.OPENROUTER_API_KEY = 'sk-test';
    for (const v of ['true', 'FALSE', '0', 'no', 'off', '']) {
      process.env.AI_ENABLED = v;
      expect(aiKey(), `AI_ENABLED=${JSON.stringify(v)}`).toBe('sk-test');
    }
  });
});

describe('aiUnavailableReason', () => {
  // A log line should answer the question it raises: switched off on purpose,
  // or never configured?
  it('distinguishes switched-off from unconfigured', () => {
    process.env.AI_ENABLED = 'false';
    expect(aiUnavailableReason()).toContain('switched off');

    delete process.env.AI_ENABLED;
    expect(aiUnavailableReason()).toContain('OPENROUTER_API_KEY');
  });
});
