// The bucket key is the whole correctness of the throttle: get it wrong and
// either everyone shares one counter (signup shuts for the world after five
// families) or every request gets a fresh one (the limit never trips and
// nothing looks wrong).
//
// claimSignupSlot itself is not unit-tested here — it is one RPC call, and the
// behaviour worth proving about it lives in Postgres (see migration 0053: the
// increment and the comparison are one statement so two simultaneous signups
// cannot both read "4 so far"). A mock of the Supabase client would only
// assert that the code calls the function it obviously calls.

import { afterEach, describe, expect, it } from 'vitest';
import { signupBucket } from './signup-throttle';

const SALT = process.env.SIGNUP_THROTTLE_SALT;

afterEach(() => {
  if (SALT === undefined) delete process.env.SIGNUP_THROTTLE_SALT;
  else process.env.SIGNUP_THROTTLE_SALT = SALT;
});

const h = (init: Record<string, string>) => new Headers(init);
const DAY = new Date('2026-09-05T12:00:00Z');
const SAME_DAY_LATER = new Date('2026-09-05T23:59:00Z');
const NEXT_DAY = new Date('2026-09-06T00:01:00Z');

describe('signupBucket', () => {
  it('gives one address one bucket for a whole day', () => {
    const a = signupBucket(h({ 'x-forwarded-for': '203.0.113.7' }), DAY);
    const b = signupBucket(h({ 'x-forwarded-for': '203.0.113.7' }), SAME_DAY_LATER);
    expect(a).toBe(b);
  });

  it('starts a fresh bucket the next day', () => {
    const a = signupBucket(h({ 'x-forwarded-for': '203.0.113.7' }), DAY);
    const b = signupBucket(h({ 'x-forwarded-for': '203.0.113.7' }), NEXT_DAY);
    expect(a).not.toBe(b);
  });

  it('separates different addresses', () => {
    const a = signupBucket(h({ 'x-forwarded-for': '203.0.113.7' }), DAY);
    const b = signupBucket(h({ 'x-forwarded-for': '203.0.113.8' }), DAY);
    expect(a).not.toBe(b);
  });

  // Vercel's edge sets x-vercel-forwarded-for and overwrites what the client
  // sent; plain x-forwarded-for is appended to and its leftmost entry is
  // whatever the caller chose to put there. Preferring the wrong one would
  // hand every visitor their own private counter.
  it('prefers the header the platform controls', () => {
    const spoofed = signupBucket(
      h({ 'x-vercel-forwarded-for': '203.0.113.7', 'x-forwarded-for': '198.51.100.1' }),
      DAY,
    );
    const honest = signupBucket(h({ 'x-vercel-forwarded-for': '203.0.113.7' }), DAY);
    expect(spoofed).toBe(honest);
  });

  it('reads the client end of a proxy chain', () => {
    const chained = signupBucket(
      h({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178' }),
      DAY,
    );
    const direct = signupBucket(h({ 'x-forwarded-for': '203.0.113.7' }), DAY);
    expect(chained).toBe(direct);
  });

  it('falls back to x-real-ip when nothing else is present', () => {
    const a = signupBucket(h({ 'x-real-ip': '203.0.113.7' }), DAY);
    const b = signupBucket(h({ 'x-forwarded-for': '203.0.113.7' }), DAY);
    expect(a).toBe(b);
  });

  // An unattributable request shares one bucket rather than getting a free
  // pass. If that ever became the common case the limit would be felt, which
  // is the right way round for something we cannot identify.
  it('still produces a bucket when there is no address at all', () => {
    const a = signupBucket(h({}), DAY);
    expect(a).toMatch(/^[0-9a-f]{32}:2026-09-05$/);
    expect(a).toBe(signupBucket(h({}), SAME_DAY_LATER));
  });

  // The salt is what stops the table being a reversible visitor list: the
  // whole IPv4 space is 2^32 values, so an unsalted hash is enumerable in
  // seconds. If this ever passes without the salt applied, that property is
  // gone and nothing else would notice.
  it('mixes in the salt, so the key is not just a hash of the address', () => {
    process.env.SIGNUP_THROTTLE_SALT = 'salt-one';
    const one = signupBucket(h({ 'x-forwarded-for': '203.0.113.7' }), DAY);
    process.env.SIGNUP_THROTTLE_SALT = 'salt-two';
    const two = signupBucket(h({ 'x-forwarded-for': '203.0.113.7' }), DAY);
    expect(one).not.toBe(two);
  });

  it('never contains the address it was built from', () => {
    const bucket = signupBucket(h({ 'x-forwarded-for': '203.0.113.7' }), DAY);
    expect(bucket).not.toContain('203.0.113.7');
    expect(bucket).not.toContain('203.0.113');
  });
});
