// The tier map decides whether a stranger can spend our money. The tests that
// matter are the ones that fail CLOSED — a permissive bug here is silent and
// expensive, where a restrictive one is a support email.

import { afterEach, describe, expect, it } from 'vitest';
import { can, maxKidsFor, signupTier, TIER_LIMITS, type Capability } from './tier';

const ALL: Capability[] = [
  'play',
  'kid:manage',
  'ai',
  'game:create',
  'ticket:file',
  'ticket:triage',
  'family:settings',
];

describe('can', () => {
  it('gives the full tier everything', () => {
    for (const cap of ALL) expect(can('full', cap), cap).toBe(true);
  });

  it('gives the restricted tier play and its own kids, and nothing else', () => {
    expect(can('restricted', 'play')).toBe(true);
    expect(can('restricted', 'kid:manage')).toBe(true);
    for (const cap of ALL.filter((c) => c !== 'play' && c !== 'kid:manage')) {
      expect(can('restricted', cap), cap).toBe(false);
    }
  });

  // The money one, called out on its own because it is the reason the tier
  // exists at all.
  it('never lets a restricted family reach a paid model', () => {
    expect(can('restricted', 'ai')).toBe(false);
  });

  // A hand-edited row, a value from a newer deploy, a typo. "May this stranger
  // spend money" must not default to yes.
  it('fails closed on anything it does not recognise', () => {
    for (const bad of ['', 'FULL', 'premium', 'admin', null, undefined]) {
      expect(can(bad, 'ai'), String(bad)).toBe(false);
      expect(can(bad, 'game:create'), String(bad)).toBe(false);
      // ...but still lets them play, so a bad value degrades rather than
      // bricking a family mid-session.
      expect(can(bad, 'play'), String(bad)).toBe(true);
    }
  });
});

describe('kid limits', () => {
  it('caps the restricted tier at 3', () => {
    expect(maxKidsFor('restricted')).toBe(3);
    expect(TIER_LIMITS.restricted.maxKids).toBe(3);
  });

  it('gives the full tier room but not infinity', () => {
    // A number, not Infinity: this is a runaway-loop guard, not a product
    // limit, and Infinity would make the comparison in the add-kid route
    // meaningless.
    expect(Number.isFinite(maxKidsFor('full'))).toBe(true);
    expect(maxKidsFor('full')).toBeGreaterThan(maxKidsFor('restricted'));
  });

  it('falls back to the restricted cap for an unknown tier', () => {
    expect(maxKidsFor('nonsense')).toBe(3);
    expect(maxKidsFor(null)).toBe(3);
  });
});

describe('signupTier', () => {
  const original = process.env.SIGNUP_DEFAULT_TIER;
  afterEach(() => {
    if (original === undefined) delete process.env.SIGNUP_DEFAULT_TIER;
    else process.env.SIGNUP_DEFAULT_TIER = original;
  });

  // Defaults to full FOR THE OPEN-SOURCE CUT: a self-hoster's only signups are
  // their own household, and shipping 'restricted' upstream would make every
  // fresh install feel broken for no reason.
  it('defaults to full when unset', () => {
    delete process.env.SIGNUP_DEFAULT_TIER;
    expect(signupTier()).toBe('full');
  });

  it('honours restricted when a deployment asks for it', () => {
    process.env.SIGNUP_DEFAULT_TIER = 'restricted';
    expect(signupTier()).toBe('restricted');
  });

  // This one is the deployment owner's own config, not untrusted input — a
  // typo should not make signup impossible.
  it('falls back to full on a typo rather than throwing', () => {
    process.env.SIGNUP_DEFAULT_TIER = 'restrcited';
    expect(signupTier()).toBe('full');
  });
});
