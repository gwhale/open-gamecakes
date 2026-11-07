import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const inFn = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: () => ({
    rpc,
    from: () => ({ delete: () => ({ in: inFn }) }),
  }),
}));

import {
  PIN_TRIES_PER_DAY,
  PIN_TRIES_PER_WINDOW,
  PIN_WINDOW_MS,
  claimPinAttempt,
  clearPinAttempts,
  pinBuckets,
} from './pin-attempts';

const NOW = 1_800_000_000_000;

beforeEach(() => {
  rpc.mockReset();
  inFn.mockReset();
  inFn.mockResolvedValue({ error: null });
});

describe('pinBuckets', () => {
  it('holds still within a window and moves on after it', () => {
    const a = pinBuckets('f1', NOW);
    const start = Math.floor(NOW / PIN_WINDOW_MS) * PIN_WINDOW_MS;
    expect(pinBuckets('f1', start).window).toBe(a.window);
    expect(pinBuckets('f1', start + PIN_WINDOW_MS).window).not.toBe(a.window);
  });

  it('separates families and never carries the family id', () => {
    const a = pinBuckets('family-one', NOW);
    expect(pinBuckets('family-two', NOW).window).not.toBe(a.window);
    expect(a.window + a.day).not.toContain('family-one');
  });
});

describe('claimPinAttempt', () => {
  it('spends a try against both limits', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(claimPinAttempt('f1', NOW)).resolves.toBe(true);
    const b = pinBuckets('f1', NOW);
    expect(rpc).toHaveBeenCalledWith('claim_signup_slot', { p_bucket: b.window, p_limit: PIN_TRIES_PER_WINDOW });
    expect(rpc).toHaveBeenCalledWith('claim_signup_slot', { p_bucket: b.day, p_limit: PIN_TRIES_PER_DAY });
  });

  it('refuses when the window is full, without spending the daily count', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(claimPinAttempt('f1', NOW)).resolves.toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('refuses when only the daily limit is full', async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: false, error: null });
    await expect(claimPinAttempt('f1', NOW)).resolves.toBe(false);
  });

  it('fails closed when the counter errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'down' } });
    await expect(claimPinAttempt('f1', NOW)).resolves.toBe(false);
  });
});

describe('clearPinAttempts', () => {
  it('removes both counters', async () => {
    await clearPinAttempts('f1', NOW);
    const b = pinBuckets('f1', NOW);
    expect(inFn).toHaveBeenCalledWith('bucket', [b.window, b.day]);
  });
});
