import { describe, expect, it } from 'vitest';
import {
  CAKEY_FOLLOW_GAP_PX,
  CAKEY_FOLLOW_PX,
  CAKEY_FOLLOW_SLACK_PX,
  cakeyFollowSpeed,
  cakeyFollowSpot,
} from './cakey-follow';
import { WALK_SPEED_PX } from './types';

const kid = { x: 1000, y: 1000 };

describe('cakeyFollowSpot', () => {
  it('ignores a kid out of range, so he keeps wandering', () => {
    expect(cakeyFollowSpot(kid, { x: kid.x + CAKEY_FOLLOW_PX + 1, y: kid.y })).toBeNull();
  });

  it('stays put when already beside the kid', () => {
    expect(cakeyFollowSpot(kid, { x: kid.x + CAKEY_FOLLOW_GAP_PX + CAKEY_FOLLOW_SLACK_PX, y: kid.y })).toBeNull();
    expect(cakeyFollowSpot(kid, { x: kid.x + 20, y: kid.y })).toBeNull();
  });

  it('walks up to the gap on his own side of the kid, never onto them', () => {
    const spot = cakeyFollowSpot(kid, { x: kid.x, y: kid.y - 300 });
    expect(spot).not.toBeNull();
    expect(spot!.x).toBeCloseTo(kid.x);
    expect(spot!.y).toBeCloseTo(kid.y - CAKEY_FOLLOW_GAP_PX);
  });
});

describe('cakeyFollowSpeed', () => {
  it('is always slower than the kid, so walking away leaves him behind', () => {
    for (let d = 0; d <= CAKEY_FOLLOW_PX + 100; d += 20) {
      expect(cakeyFollowSpeed(d)).toBeLessThan(WALK_SPEED_PX);
    }
  });

  it('is quicker the further behind he is', () => {
    expect(cakeyFollowSpeed(350)).toBeGreaterThan(cakeyFollowSpeed(200));
  });
});
