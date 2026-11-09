import { describe, expect, it } from 'vitest';
import {
  NET_SEND_INTERVAL_MS,
  REMOTE_EXTRAPOLATE_MAX_MS,
  REMOTE_RENDER_DELAY_MS,
  createNetTicker,
  createPeerMotion,
  type NetSample,
} from './remote-motion';

const packet = (t: number, cx: number, m: 0 | 1 = 1, vx = 100): NetSample => ({
  cx,
  cy: 0,
  vx,
  vy: 0,
  r: 0,
  m,
  t,
});

describe('createNetTicker', () => {
  it('announces the spawn point once, then stays silent while still', () => {
    const net = createNetTicker();
    const sent = [0, 16, 200, 400, 600, 800].map((t) => net.tick(t, 50, 60));
    const packets = sent.filter(Boolean);
    expect(packets).toHaveLength(1);
    expect(packets[0]).toMatchObject({ cx: 50, cy: 60, m: 0 });
    expect(net.tick(5000, 50, 60)).toBeNull();
  });

  it('caps sends at the interval while moving', () => {
    const net = createNetTicker();
    let sends = 0;
    for (let t = 0; t <= 1000; t += 16) {
      if (net.tick(t, t * 0.2, 0)) sends++;
    }
    expect(sends).toBeLessThanOrEqual(Math.ceil(1000 / NET_SEND_INTERVAL_MS) + 1);
    expect(sends).toBeGreaterThanOrEqual(Math.floor(1000 / NET_SEND_INTERVAL_MS) - 1);
  });

  it('measures velocity from positions, so any kind of ride reports it', () => {
    const net = createNetTicker();
    let sent: NetSample | null = null;
    for (let t = 0; t < 500; t += 16) sent = net.tick(t, t * 0.2, 0) ?? sent;
    expect(sent?.m).toBe(1);
    expect(sent?.vx).toBeGreaterThan(150);
    expect(sent?.vx).toBeLessThan(250);
  });

  it('sends exactly one rest packet when movement stops, keeping the heading', () => {
    const net = createNetTicker();
    let last: NetSample | null = null;
    for (let t = 0; t <= 400; t += 16) last = net.tick(t, t * 0.2, 0) ?? last;
    const heading = last?.r;
    expect(heading).toBeCloseTo(Math.PI / 2);

    const after: NetSample[] = [];
    for (let t = 416; t <= 1200; t += 16) {
      const sent = net.tick(t, 80, 0);
      if (sent) after.push(sent);
    }
    expect(after.filter((p) => p.m === 0)).toHaveLength(1);
    expect(after.find((p) => p.m === 0)?.r).toBe(heading);
  });

  it('holds through a single unchanged frame instead of sending a false stop', () => {
    const net = createNetTicker();
    for (let t = 0; t <= 400; t += 16) net.tick(t, t * 0.2, 0);
    const sent = net.tick(416, 80, 0);
    expect(sent === null || sent.m === 1).toBe(true);
  });

  it('forceNext resends a still spot, for a kid who arrives later', () => {
    const net = createNetTicker();
    for (let t = 0; t <= 600; t += 16) net.tick(t, 10, 20);
    expect(net.tick(1000, 10, 20)).toBeNull();
    net.forceNext();
    expect(net.tick(1016, 10, 20)).toMatchObject({ cx: 10, cy: 20, m: 0 });
    expect(net.tick(1032, 10, 20)).toBeNull();
  });
});

describe('createPeerMotion', () => {
  it('has no pose until the first packet', () => {
    expect(createPeerMotion().sample(1000)).toBeNull();
  });

  it('interpolates between packets, drawn behind the newest', () => {
    const motion = createPeerMotion();
    motion.push(packet(0, 0), 0);
    motion.push(packet(125, 100), 125);
    const pose = motion.sample(REMOTE_RENDER_DELAY_MS + 50);
    expect(pose?.x).toBeCloseTo(40);
    expect(pose?.moving).toBe(true);
  });

  it('ignores the difference between sender and receiver clocks', () => {
    const motion = createPeerMotion();
    const skew = 987654;
    motion.push(packet(skew, 0), 0);
    motion.push(packet(skew + 125, 100), 125);
    expect(motion.sample(REMOTE_RENDER_DELAY_MS + 50)?.x).toBeCloseTo(40);
  });

  it('drops late packets instead of walking the peer backward', () => {
    const motion = createPeerMotion();
    motion.push(packet(0, 0), 0);
    motion.push(packet(250, 200), 250);
    motion.push(packet(125, 999), 260);
    const pose = motion.sample(REMOTE_RENDER_DELAY_MS + 125);
    expect(pose?.x).toBeCloseTo(100);
  });

  it('coasts along its velocity when packets stop, then stands still', () => {
    const motion = createPeerMotion();
    motion.push(packet(0, 0), 0);
    const coasting = motion.sample(REMOTE_RENDER_DELAY_MS + 100);
    expect(coasting?.x).toBeCloseTo(10);
    expect(coasting?.moving).toBe(true);

    const stood = motion.sample(REMOTE_RENDER_DELAY_MS + REMOTE_EXTRAPOLATE_MAX_MS + 1);
    expect(stood).toMatchObject({ x: 0, moving: false });
  });

  it('settles exactly on a rest packet', () => {
    const motion = createPeerMotion();
    motion.push(packet(0, 0), 0);
    motion.push(packet(125, 100, 0, 0), 125);
    expect(motion.sample(1000)).toMatchObject({ x: 100, moving: false });
  });
});
