import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const guard = vi.fn();
const claim = vi.fn();
const clear = vi.fn();
const verify = vi.fn();
const change = vi.fn();
const sameOrigin = vi.fn();

vi.mock('@/lib/auth/api-guard', () => ({ requireParentModeOrJson: guard }));
vi.mock('@/lib/auth/pin-attempts', () => ({ claimPinAttempt: claim, clearPinAttempts: clear }));
vi.mock('@/lib/auth/parent-mode', () => ({
  changeParentPin: change,
  verifyParentPin: verify,
  isValidPinShape: (p: string) => /^\d{4,8}$/.test(p),
}));
vi.mock('@/lib/http/same-origin', () => ({ isSameOriginRequest: sameOrigin }));

const { POST } = await import('./route');

const call = (body: unknown) =>
  POST(new Request('http://x/api/parent/pin', { method: 'POST', body: JSON.stringify(body) }) as unknown as NextRequest);

beforeEach(() => {
  vi.clearAllMocks();
  sameOrigin.mockReturnValue(true);
  guard.mockResolvedValue({ family: { id: 'f1' } });
  claim.mockResolvedValue(true);
  verify.mockResolvedValue(true);
  change.mockResolvedValue(true);
});

describe('POST /api/parent/pin', () => {
  it('changes the PIN when the current one is right', async () => {
    const res = await call({ current: '1234', next: '5678' });
    expect(res.status).toBe(200);
    expect(change).toHaveBeenCalledWith('f1', '5678');
    expect(clear).toHaveBeenCalledWith('f1');
  });

  it('refuses a wrong current PIN and changes nothing', async () => {
    verify.mockResolvedValue(false);
    const res = await call({ current: '0000', next: '5678' });
    expect(res.status).toBe(403);
    expect(change).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it('refuses when locked, without comparing the PIN', async () => {
    claim.mockResolvedValue(false);
    const res = await call({ current: '1234', next: '5678' });
    expect(res.status).toBe(429);
    expect(verify).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
  });

  it('spends a try before comparing', async () => {
    await call({ current: '1234', next: '5678' });
    expect(claim.mock.invocationCallOrder[0]).toBeLessThan(verify.mock.invocationCallOrder[0]);
  });

  it('rejects a badly formed or unchanged new PIN without spending a try', async () => {
    expect((await call({ current: '1234', next: '12' })).status).toBe(400);
    expect((await call({ current: '1234', next: '1234' })).status).toBe(400);
    expect(claim).not.toHaveBeenCalled();
  });

  it('stops a cross-site post and anyone outside grown-up mode', async () => {
    sameOrigin.mockReturnValue(false);
    expect((await call({ current: '1234', next: '5678' })).status).toBe(403);
    sameOrigin.mockReturnValue(true);
    guard.mockResolvedValue(Response.json({}, { status: 403 }));
    expect((await call({ current: '1234', next: '5678' })).status).toBe(403);
    expect(change).not.toHaveBeenCalled();
  });
});
